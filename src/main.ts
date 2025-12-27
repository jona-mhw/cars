import './style.css';
import { Car, AILearningLog } from './car';
import type { GenerationSummary } from './car';
import { Road } from './road';
import { Network } from './network';
import { Visualizer } from './visualizer';

const carCanvas = document.getElementById("carCanvas") as HTMLCanvasElement;
const carCtx = carCanvas.getContext("2d")!;
const networkCanvas = document.getElementById("networkCanvas") as HTMLCanvasElement;
const networkCtx = networkCanvas.getContext("2d")!;

const mutationRateSlider = document.getElementById("mutationRate") as HTMLInputElement;
const mutationValLabel = document.getElementById("mutationVal") as HTMLSpanElement;
const genLabel = document.getElementById("generationCount") as HTMLSpanElement;
const aliveLabel = document.getElementById("aliveCount") as HTMLSpanElement;
const fitnessLabel = document.getElementById("bestFitness") as HTMLSpanElement;
const overtakeLabel = document.getElementById("overtakeCount") as HTMLSpanElement;
const deathReasonLabel = document.getElementById("deathReason") as HTMLSpanElement;
const behaviorAnalysis = document.getElementById("behaviorAnalysis") as HTMLDivElement;
const statusBar = document.getElementById("statusBar") as HTMLDivElement;
const liveFeed = document.getElementById("liveFeed") as HTMLDivElement;
const trendIndicator = document.getElementById("trendIndicator") as HTMLSpanElement;
const progressBar = document.getElementById("progressBar") as HTMLDivElement;

// ============================================================
// LIVE FEED SYSTEM - Real-time activity logging
// ============================================================
interface FeedEvent {
  type: 'overtake' | 'collision' | 'generation' | 'milestone' | 'learning';
  message: string;
  icon: string;
}

const feedMessages = {
  overtake: [
    "Adelantamiento limpio",
    "Maniobra ejecutada",
    "Esquivó tráfico",
    "Pasó un obstáculo"
  ],
  milestone: [
    "Nuevo récord de distancia",
    "Mejor rendimiento hasta ahora",
    "Superó marca anterior"
  ],
  learning: [
    "Patrón detectado: prefiere carril",
    "Aprendiendo a esquivar",
    "Mejorando reflejos",
    "Ajustando estrategia"
  ]
};

let lastOvertakeCount = 0;
let bestDistanceEver = 0;
let feedItemCount = 0;
const MAX_FEED_ITEMS = 15;

function addFeedItem(event: FeedEvent) {
  // Remove waiting message if exists
  const waiting = liveFeed.querySelector('.feed-waiting');
  if (waiting) waiting.remove();

  const item = document.createElement('div');
  item.className = `feed-item feed-${event.type}`;

  const time = new Date().toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  item.innerHTML = `
    <span class="feed-icon">${event.icon}</span>
    <span>${event.message}</span>
    <span class="feed-time">${time}</span>
  `;

  // Insert at the top
  liveFeed.insertBefore(item, liveFeed.firstChild);
  feedItemCount++;

  // Limit items
  while (liveFeed.children.length > MAX_FEED_ITEMS) {
    liveFeed.removeChild(liveFeed.lastChild!);
  }
}

function getRandomMessage(type: keyof typeof feedMessages): string {
  const messages = feedMessages[type];
  return messages[Math.floor(Math.random() * messages.length)];
}

function updateCanvasSize() {
  carCanvas.width = 400;
  carCanvas.height = window.innerHeight * 0.9;
  networkCanvas.width = 400;
  networkCanvas.height = 300;
}

window.addEventListener('resize', updateCanvasSize);
updateCanvasSize();

const road = new Road(carCanvas.width / 2, carCanvas.width * 0.9);

// ============================================================
// TRAFFIC SYSTEM: Dense, challenging, forces maneuvering
// ============================================================
const TRAFFIC_SPEED = 2;
const TRAFFIC_SPAWN_DISTANCE = 120; // Distance between traffic rows

function createTraffic(): Car[] {
  const cars: Car[] = [];

  // AI starts in lane 1 (center) at Y=100
  // First traffic must give AI time to react and learn

  for (let row = 0; row < 40; row++) {
    // Start traffic further away (Y=-300) to give AI reaction time
    const y = -300 - (row * TRAFFIC_SPAWN_DISTANCE);

    let openLane: number;

    if (row < 3) {
      // First 3 rows: center lane (1) is ALWAYS open - easy start
      openLane = 1;
    } else if (row < 8) {
      // Next 5 rows: center OR adjacent lane open - learning phase
      openLane = Math.random() < 0.5 ? 1 : (Math.random() < 0.5 ? 0 : 2);
    } else {
      // Rest: fully random - real challenge
      openLane = Math.floor(Math.random() * 3);
    }

    // Fill the other two lanes with traffic
    for (let lane = 0; lane < 3; lane++) {
      if (lane !== openLane) {
        cars.push(new Car(road.getLaneCenter(lane), y, 30, 50, "DUMMY", TRAFFIC_SPEED));
      }
    }
  }

  return cars;
}

// Track the furthest Y position reached to spawn more traffic
let furthestY = 0;
let traffic = createTraffic();

// Spawn more traffic as the leader advances (infinite road)
function updateTraffic(leaderY: number) {
  // If leader has advanced significantly, spawn more traffic ahead
  const spawnThreshold = furthestY - 2000; // Spawn when within 2000 units

  if (leaderY < spawnThreshold) {
    // Calculate how many new rows to add
    const rowsToAdd = Math.ceil((spawnThreshold - leaderY) / TRAFFIC_SPAWN_DISTANCE);

    for (let i = 0; i < rowsToAdd; i++) {
      furthestY -= TRAFFIC_SPAWN_DISTANCE;
      const openLane = Math.floor(Math.random() * 3);

      for (let lane = 0; lane < 3; lane++) {
        if (lane !== openLane) {
          traffic.push(new Car(road.getLaneCenter(lane), furthestY, 30, 50, "DUMMY", TRAFFIC_SPEED));
        }
      }
    }
  }

  // Remove traffic that's too far behind (cleanup)
  traffic = traffic.filter(car => car.y < leaderY + 500);
}

const N = 8; // Population size - small group for clearer visualization
let generation = 1;
let cars = generateCars(N);
let bestCar = cars[0];

// Smooth camera variables
let cameraY = 100;
const CAMERA_SMOOTHNESS = 0.05; // Lower = smoother camera

if (localStorage.getItem("bestBrain")) {
  for (let i = 0; i < cars.length; i++) {
    cars[i].brain = JSON.parse(localStorage.getItem("bestBrain")!);
    if (i != 0) {
      Network.mutate(cars[i].brain!, 0.2); // Higher mutation when loading
    }
  }
}

function generateCars(N: number) {
  const cars = [];
  const startY = 100;
  const roadWidth = road.width;

  // Distribute cars in a single horizontal line
  for (let i = 0; i < N; i++) {
    // X position: evenly spread across the road width
    const margin = roadWidth * 0.1;
    const usableWidth = roadWidth - (margin * 2);
    const spacing = usableWidth / (N - 1 || 1);
    const x = road.left + margin + (i * spacing);

    const car = new Car(x, startY, 30, 50, "AI", 4);
    car.displayNumber = i + 1;
    cars.push(car);
  }
  return cars;
}

function save() {
  localStorage.setItem("bestBrain", JSON.stringify(bestCar.brain));
}

function discard() {
  localStorage.removeItem("bestBrain");
  // Reset live feed tracking
  lastOvertakeCount = 0;
  bestDistanceEver = 0;
  location.reload();
}

document.getElementById("saveBest")?.addEventListener("click", save);
document.getElementById("discardBrain")?.addEventListener("click", discard);

mutationRateSlider.addEventListener("input", (e) => {
  mutationValLabel.innerText = (e.target as HTMLInputElement).value;
});

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function animate(time: number = 0) {
  // Update traffic
  for (let i = 0; i < traffic.length; i++) {
    traffic[i].update(road.borders);
  }

  // Update AI cars
  for (let i = 0; i < cars.length; i++) {
    cars[i].update(road.borders, traffic);
  }

  // Find best car - the one that traveled furthest (lowest Y)
  // Consider ALL cars, not just active ones, for proper evolution
  bestCar = cars.reduce((best, car) => {
    // Prefer the car that went furthest before crashing (or is still alive)
    const carDistance = 100 - car.y;
    const bestDistance = 100 - best.y;
    return carDistance > bestDistance ? car : best;
  }, cars[0]);

  // For visualization and traffic updates, prefer an alive car if available
  const activeCars = cars.filter(c => !c.damaged);
  const visualBestCar = activeCars.length > 0
    ? activeCars.reduce((best, car) => car.y < best.y ? car : best, activeCars[0])
    : bestCar;

  // Spawn more traffic as leader advances
  if (activeCars.length > 0) {
    updateTraffic(visualBestCar.y);
  }

  // Smooth camera movement (prevents teleportation)
  const targetCameraY = visualBestCar.y;
  cameraY = lerp(cameraY, targetCameraY, CAMERA_SMOOTHNESS);

  carCanvas.height = window.innerHeight * 0.9; // clear
  networkCanvas.height = 300;

  carCtx.save();
  carCtx.translate(0, -cameraY + carCanvas.height * 0.7);

  road.draw(carCtx);

  // Draw traffic (obstacles) - orange/red color
  for (let i = 0; i < traffic.length; i++) {
    traffic[i].draw(carCtx, "#ff6b35");
  }

  // Draw all AI cars (transparent)
  carCtx.globalAlpha = 0.2;
  for (let i = 0; i < cars.length; i++) {
    if (cars[i] !== visualBestCar) {
      cars[i].draw(carCtx, "#00d2ff");
    }
  }
  carCtx.globalAlpha = 1;

  // Draw leader with glow effect
  carCtx.shadowColor = "#00d2ff";
  carCtx.shadowBlur = 15;
  visualBestCar.draw(carCtx, "#00d2ff", true);
  carCtx.shadowBlur = 0;

  carCtx.restore();

  // Stats - Simple racing metrics
  const aliveCount = cars.filter(c => !c.damaged).length;

  // Find the car that has traveled the furthest (lowest Y)
  const leaderCar = cars.reduce((best, car) => car.y < best.y ? car : best, cars[0]);
  const maxDistance = Math.round(100 - leaderCar.y); // Distance in "meters"
  const maxOvertakes = Math.max(...cars.map(c => c.overtakeCount));

  // ============================================================
  // LIVE FEED: Detect and log events in real-time
  // ============================================================

  // Detect new overtakes
  if (maxOvertakes > lastOvertakeCount) {
    const newOvertakes = maxOvertakes - lastOvertakeCount;
    for (let i = 0; i < Math.min(newOvertakes, 3); i++) { // Max 3 events at once
      addFeedItem({
        type: 'overtake',
        message: `${getRandomMessage('overtake')} #${lastOvertakeCount + i + 1}`,
        icon: '🚗'
      });
    }
    lastOvertakeCount = maxOvertakes;
  }

  // Detect new distance milestones (every 100m)
  if (maxDistance > bestDistanceEver) {
    const prevMilestone = Math.floor(bestDistanceEver / 100);
    const newMilestone = Math.floor(maxDistance / 100);
    if (newMilestone > prevMilestone && newMilestone > 0) {
      addFeedItem({
        type: 'milestone',
        message: `¡${newMilestone * 100}m alcanzados!`,
        icon: '🏆'
      });
    }
    bestDistanceEver = maxDistance;
  }

  // Update progress bar (based on best distance ever, cap at 2000m for visual)
  const progressPercent = Math.min((bestDistanceEver / 2000) * 100, 100);
  progressBar.style.width = `${progressPercent}%`;

  aliveLabel.innerText = `${aliveCount} / ${N}`;
  genLabel.innerText = generation.toString();
  fitnessLabel.innerText = `${maxDistance} m`;
  overtakeLabel.innerText = maxOvertakes.toString();

  // Update status bar
  if (aliveCount > 0) {
    deathReasonLabel.innerText = `${aliveCount} en carrera...`;
    statusBar.className = 'status-bar status-racing';
  } else {
    deathReasonLabel.innerText = 'Generación terminada';
    statusBar.className = 'status-bar status-crashed';
  }

  // Network Visualizer
  networkCtx.lineDashOffset = -time / 50;
  if (visualBestCar.brain) {
    Visualizer.drawNetwork(networkCtx, visualBestCar.brain);
  }

  // Generation only ends when ALL cars have crashed
  if (aliveCount === 0) {
    nextGeneration();
  }

  requestAnimationFrame(animate);
}

function nextGeneration() {
  // ============================================================
  // LOG GENERATION SUMMARY before resetting
  // ============================================================
  // Sort by fitness (overtakes * 1000 + distance)
  const sortedCars = [...cars].sort((a, b) => b.fitness - a.fitness);
  bestCar = sortedCars[0];

  // Get behavioral analysis from best car
  const bestCarSummary = bestCar.getSummary();

  // Create generation summary for logging
  const genSummary: GenerationSummary = {
    generation: generation,
    bestCarId: bestCar.id,
    totalOvertakes: bestCar.overtakeCount,
    maxDistance: Math.abs(100 - bestCar.y),
    survivalFrames: bestCar.frameCount,
    deathReason: bestCar.deathReason,
    patterns: bestCarSummary.patterns,
    keyMoments: bestCarSummary.keyMoments.slice(-10) // Last 10 key moments
  };

  AILearningLog.generationSummaries.push(genSummary);
  AILearningLog.currentGeneration = generation + 1;
  AILearningLog.bestCarLogs = bestCar.decisionLog.slice(-50); // Keep last 50 decisions
  AILearningLog.pruneOldData(100); // Keep last 100 generations

  // Update behavior analysis UI
  updateBehaviorAnalysis(genSummary);

  generation++;

  const nextCars = generateCars(N);
  const mutationRate = parseFloat(mutationRateSlider.value);

  // Seed new cars with best car's brain
  for (let i = 0; i < nextCars.length; i++) {
    if (bestCar.brain) {
      nextCars[i].brain = JSON.parse(JSON.stringify(bestCar.brain));
      if (i != 0 && nextCars[i].brain) {
        // Variable mutation: some with small changes, some with big changes
        const variableMutation = i < N * 0.3 ? mutationRate * 0.5 : mutationRate * (1 + Math.random());
        Network.mutate(nextCars[i].brain!, variableMutation);
      }
    }
  }

  cars = nextCars;
  cameraY = 100;

  // Reset tracking for new generation
  lastOvertakeCount = 0;

  // Reset traffic system for new generation
  furthestY = 0;
  traffic = createTraffic();
}

// ============================================================
// BEHAVIOR ANALYSIS: Interpret what the AI is learning
// ============================================================
function updateBehaviorAnalysis(summary: GenerationSummary) {
  // Track distance progress across generations
  const lastGens = AILearningLog.getLastNGenerations(5);

  // Add generation event to feed
  addFeedItem({
    type: 'generation',
    message: `Gen ${summary.generation} completada: ${Math.round(summary.maxDistance)}m`,
    icon: '🧬'
  });

  let trendText = '--';
  let trendClass = 'trend-stable';

  if (lastGens.length >= 3) {
    const distances = lastGens.map(g => g.maxDistance);
    const recentAvg = (distances[distances.length - 1] + distances[distances.length - 2]) / 2;
    const olderAvg = (distances[0] + distances[1]) / 2;
    const improvement = ((recentAvg - olderAvg) / Math.max(olderAvg, 1)) * 100;

    if (improvement > 10) {
      trendText = `+${Math.round(improvement)}%`;
      trendClass = 'trend-up';
      // Occasionally add learning insight
      if (Math.random() < 0.3) {
        addFeedItem({
          type: 'learning',
          message: getRandomMessage('learning'),
          icon: '🧠'
        });
      }
    } else if (improvement < -10) {
      trendText = `${Math.round(improvement)}%`;
      trendClass = 'trend-down';
    } else {
      trendText = 'Estable';
      trendClass = 'trend-stable';
    }
  }

  trendIndicator.textContent = trendText;
  trendIndicator.className = trendClass;

  // Build analysis text
  let analysis = '';
  if (summary.patterns.length > 0) {
    const mainPattern = summary.patterns[0];
    if (mainPattern.includes('AGGRESSIVE')) {
      analysis = 'Comportamiento agresivo - adelanta mucho';
    } else if (mainPattern.includes('PASSIVE')) {
      analysis = 'Comportamiento pasivo - no adelanta';
    } else if (mainPattern.includes('FAST')) {
      analysis = 'Mantiene buena velocidad';
    } else if (mainPattern.includes('SLOW')) {
      analysis = 'Velocidad baja - posible exploit';
    } else {
      analysis = mainPattern.replace(/_/g, ' ').toLowerCase();
    }
  }

  if (lastGens.length >= 2) {
    const avgDistance = lastGens.map(g => g.maxDistance).reduce((a, b) => a + b, 0) / lastGens.length;
    analysis += ` | Promedio: ${Math.round(avgDistance)}m`;
  }

  behaviorAnalysis.textContent = analysis || 'Recopilando datos...';
}

// ============================================================
// EXPORT LOGS: Download AI learning data for analysis
// ============================================================
function exportLogs() {
  const data = AILearningLog.exportToJSON();
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ai-learning-log-gen${generation}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("exportLogs")?.addEventListener("click", exportLogs);

animate();
