import './style.css';
import { Car, AILearningLog } from './car';
import type { GenerationSummary } from './car';
import { Road } from './road';
import { Network } from './network';
import { Visualizer } from './visualizer';
import { SensorConfig } from './sensor';
import { DQNAgent, dqnAgent } from './qlearning';

// ============================================================
// LEARNING MODE SYSTEM
// ============================================================
type LearningMode = 'genetic' | 'qlearning';
let currentLearningMode: LearningMode = 'genetic';

// Estado para Q-Learning
let prevCarStates: Map<number, { y: number; overtakes: number; sensors: number[]; angle: number }> = new Map();

const carCanvas = document.getElementById("carCanvas") as HTMLCanvasElement;
const carCtx = carCanvas.getContext("2d")!;
const networkCanvas = document.getElementById("networkCanvas") as HTMLCanvasElement;
const networkCtx = networkCanvas.getContext("2d")!;

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
const fpsCounter = document.getElementById("fpsCounter") as HTMLSpanElement;
const learningModeLabel = document.getElementById("learningModeLabel") as HTMLSpanElement;
const explorationLabel = document.getElementById("explorationRate") as HTMLSpanElement;
const episodeCountLabel = document.getElementById("episodeCount") as HTMLSpanElement;

// FPS tracking
let lastTime = performance.now();
let frameCount = 0;
let fps = 60;

// Time control - velocidad de simulación
let timeScale = 1; // 1 = tiempo real, 2 = 2x, 4 = 4x, etc.

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

// ============================================================
// AUTO-SAVE & GENETIC ALGORITHM IMPROVEMENTS
// ============================================================
let allTimeBestDistance = Number(localStorage.getItem("allTimeBestDistance") || "0");
const DIVERSITY_INJECTION_INTERVAL = 10; // Cada 10 generaciones inyectar diversidad
const DIVERSITY_RATIO = 0.25; // 25% de la población será completamente nueva

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
// Ajustado para mejor experiencia en velocidad 1X
// ============================================================
const TRAFFIC_SPEED_BASE = 2;
const TRAFFIC_SPEED_VARIATION = 0.8; // ±0.8 de variación
const TRAFFIC_SPAWN_DISTANCE = 80; // Reducido de 120 a 80 para obstáculos más cercanos
const TRAFFIC_START_Y = -50; // Más cerca del inicio (antes -300)

// Función para velocidad variable de obstáculos
function getRandomTrafficSpeed(): number {
  return TRAFFIC_SPEED_BASE + (Math.random() - 0.5) * 2 * TRAFFIC_SPEED_VARIATION;
}

function createTraffic(): Car[] {
  const cars: Car[] = [];

  for (let row = 0; row < 50; row++) { // Aumentado de 40 a 50 filas
    const baseY = TRAFFIC_START_Y - (row * TRAFFIC_SPAWN_DISTANCE);
    // Variación en Y para que no estén en filas perfectas
    const yOffset = (Math.random() - 0.5) * 30; // Reducido de 40 a 30
    const y = baseY + yOffset;

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

    // Fill the other two lanes with traffic (autos naranjas normales)
    for (let lane = 0; lane < 3; lane++) {
      if (lane !== openLane) {
        // Variación en X para posición más aleatoria dentro del carril
        const xOffset = (Math.random() - 0.5) * 25;
        const x = road.getLaneCenter(lane) + xOffset;
        const car = new Car(x, y, 30, 50, "DUMMY", getRandomTrafficSpeed());
        car.obstacleType = 'car';
        cars.push(car);
      }
    }

    // Barrera gris (camión/muro móvil) - cada 7 filas después de fila 10
    if (row > 10 && row % 7 === 0) {
      const barrierLane = Math.floor(Math.random() * 3);
      const xOffset = (Math.random() - 0.5) * 15;
      // Barreras más lentas pero con variación
      const barrierSpeed = getRandomTrafficSpeed() * (0.6 + Math.random() * 0.3);
      const barrier = new Car(
        road.getLaneCenter(barrierLane) + xOffset,
        baseY - 60,
        40, 90, // Más ancho y alto
        "DUMMY",
        barrierSpeed
      );
      barrier.obstacleType = 'barrier';
      cars.push(barrier);
    }

    // Zona roja (vehículo ancho/peligro) - cada 11 filas después de fila 15
    if (row > 15 && row % 11 === 0) {
      const dangerLane = Math.random() < 0.5 ? 0.5 : 1.5; // Entre carriles
      // Zonas de peligro aún más lentas con variación
      const dangerSpeed = getRandomTrafficSpeed() * (0.4 + Math.random() * 0.3);
      const danger = new Car(
        road.getLaneCenter(Math.floor(dangerLane)) + 25,
        baseY - 30,
        90, 25, // Ancho y bajo (horizontal)
        "DUMMY",
        dangerSpeed
      );
      danger.obstacleType = 'danger';
      cars.push(danger);
    }
  }

  return cars;
}

// Track the furthest Y position reached to spawn more traffic
// createTraffic genera 50 filas desde Y=-50, espaciadas cada TRAFFIC_SPAWN_DISTANCE
const INITIAL_TRAFFIC_ROWS = 50;
let furthestY = TRAFFIC_START_Y - (INITIAL_TRAFFIC_ROWS - 1) * TRAFFIC_SPAWN_DISTANCE;
let traffic = createTraffic();

// Contador para generar obstáculos especiales
let spawnedRows = INITIAL_TRAFFIC_ROWS;

// Spawn more traffic as the leader advances (infinite road)
function updateTraffic(leaderY: number) {
  // Generar tráfico cuando el líder se acerca a 1500 unidades del último spawn
  const spawnThreshold = furthestY + 1500;

  // Si el líder está cerca del límite, generar más tráfico adelante
  if (leaderY < spawnThreshold) {
    // Generar suficientes filas para estar siempre 3000 unidades adelante
    const targetY = leaderY - 3000;
    const rowsToAdd = Math.max(1, Math.ceil((furthestY - targetY) / TRAFFIC_SPAWN_DISTANCE));

    for (let i = 0; i < rowsToAdd; i++) {
      furthestY -= TRAFFIC_SPAWN_DISTANCE;
      spawnedRows++;

      const yOffset = (Math.random() - 0.5) * 40;
      const y = furthestY + yOffset;
      const openLane = Math.floor(Math.random() * 3);

      // Autos normales con posición X aleatoria y velocidad variable
      for (let lane = 0; lane < 3; lane++) {
        if (lane !== openLane) {
          const xOffset = (Math.random() - 0.5) * 25;
          const car = new Car(road.getLaneCenter(lane) + xOffset, y, 30, 50, "DUMMY", getRandomTrafficSpeed());
          car.obstacleType = 'car';
          traffic.push(car);
        }
      }

      // Barrera gris cada 7 filas
      if (spawnedRows % 7 === 0) {
        const barrierLane = Math.floor(Math.random() * 3);
        const xOffset = (Math.random() - 0.5) * 15;
        const barrierSpeed = getRandomTrafficSpeed() * (0.6 + Math.random() * 0.3);
        const barrier = new Car(
          road.getLaneCenter(barrierLane) + xOffset,
          furthestY - 60,
          40, 90,
          "DUMMY",
          barrierSpeed
        );
        barrier.obstacleType = 'barrier';
        traffic.push(barrier);
      }

      // Zona roja cada 11 filas
      if (spawnedRows % 11 === 0) {
        const dangerLane = Math.random() < 0.5 ? 0.5 : 1.5;
        const dangerSpeed = getRandomTrafficSpeed() * (0.4 + Math.random() * 0.3);
        const danger = new Car(
          road.getLaneCenter(Math.floor(dangerLane)) + 25,
          furthestY - 30,
          90, 25,
          "DUMMY",
          dangerSpeed
        );
        danger.obstacleType = 'danger';
        traffic.push(danger);
      }
    }
  }

  // Remove traffic that's too far behind (cleanup)
  traffic = traffic.filter(car => car.y < leaderY + 500);
}

// Tamaño de población: mayor para Q-Learning (más experiencias)
const N_GENETIC = 8;
const N_QLEARNING = 12;
let N = N_GENETIC;
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
  // Asegurar que arranquen después de cargar cerebros
  ensureCarsStartMoving(cars);
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

function discard() {
  localStorage.removeItem("bestBrain");
  // Reset live feed tracking
  lastOvertakeCount = 0;
  bestDistanceEver = 0;
  location.reload();
}

document.getElementById("discardBrain")?.addEventListener("click", discard);

// ============================================================
// LEARNING MODE SELECTOR
// ============================================================
function setLearningMode(mode: LearningMode) {
  currentLearningMode = mode;

  // Actualizar UI
  const geneticBtn = document.getElementById("modeGenetic");
  const qlBtn = document.getElementById("modeQL");
  const modeDescription = document.getElementById("modeDescription");
  const infoText = document.getElementById("infoText");

  if (geneticBtn && qlBtn) {
    geneticBtn.classList.toggle("active", mode === 'genetic');
    qlBtn.classList.toggle("active", mode === 'qlearning');
  }

  if (learningModeLabel) {
    learningModeLabel.textContent = mode === 'genetic' ? 'Neuroevolución' : 'Q-Learning';
    learningModeLabel.style.color = mode === 'genetic' ? '#4ade80' : '#a855f7';
    learningModeLabel.style.background = mode === 'genetic'
      ? 'rgba(74, 222, 128, 0.15)'
      : 'rgba(168, 85, 247, 0.15)';
  }

  if (modeDescription) {
    modeDescription.textContent = mode === 'genetic'
      ? 'Evolución de redes neuronales mediante selección natural'
      : 'Aprendizaje por refuerzo con recompensas y experiencia';
  }

  if (infoText) {
    infoText.textContent = mode === 'genetic'
      ? '8 coches con IA compiten. El que llegue más lejos pasa su cerebro (con mutaciones) a la siguiente generación.'
      : 'Los coches aprenden de sus errores. Cada acción recibe una recompensa y el agente optimiza su comportamiento.';
  }

  // Mostrar/ocultar estadísticas de Q-Learning
  const qlStats = document.getElementById("qlStats");
  if (qlStats) {
    qlStats.style.display = mode === 'qlearning' ? 'block' : 'none';
  }

  // Reiniciar simulación con nuevo modo
  resetSimulation();

  addFeedItem({
    type: 'learning',
    message: `Modo: ${mode === 'genetic' ? 'Neuroevolución' : 'Q-Learning'}`,
    icon: mode === 'genetic' ? '🧬' : '🧠'
  });
}

function resetSimulation() {
  generation = 1;
  lastOvertakeCount = 0;
  bestDistanceEver = 0;
  prevCarStates.clear();

  // Ajustar población según el modo
  N = currentLearningMode === 'qlearning' ? N_QLEARNING : N_GENETIC;

  if (currentLearningMode === 'qlearning') {
    dqnAgent.reset();
  }

  cars = generateCars(N);

  // Para Q-Learning, habilitar acciones externas y asignar brain para visualización
  if (currentLearningMode === 'qlearning') {
    for (const car of cars) {
      car.useExternalActions = true;
      car.externalActions = [1, 0]; // Iniciar yendo recto
      car.brain = dqnAgent.getNetwork(); // Para visualización
    }
  }

  ensureCarsStartMoving(cars);
  cameraY = 100;
  furthestY = TRAFFIC_START_Y - (INITIAL_TRAFFIC_ROWS - 1) * TRAFFIC_SPAWN_DISTANCE;
  spawnedRows = INITIAL_TRAFFIC_ROWS;
  traffic = createTraffic();
}

// Event listeners para selector de modo
document.getElementById("modeGenetic")?.addEventListener("click", () => setLearningMode('genetic'));
document.getElementById("modeQL")?.addEventListener("click", () => setLearningMode('qlearning'));

// ============================================================
// Q-LEARNING: Establecer acciones ANTES del update
// ============================================================
function setQLearningActions() {
  for (const car of cars) {
    if (car.damaged) continue;

    // Obtener lecturas de sensores actuales
    if (car.sensor) {
      // Forzar actualización de sensores para obtener lecturas frescas
      car.sensor.update(road.borders, traffic);
      const currentSensors = car.sensor.readings.map((s: any) => s == null ? 0 : 1 - s.offset);

      // Obtener acción del agente DQN
      const action = dqnAgent.selectAction(currentSensors);

      // Establecer acción externa para que el coche la use
      car.externalActions = action;

      // Guardar sensores para calcular recompensa después
      if (!prevCarStates.has(car.id)) {
        prevCarStates.set(car.id, {
          y: car.y,
          overtakes: car.overtakeCount,
          sensors: currentSensors,
          angle: car.angle
        });
      }
    }
  }
}

// ============================================================
// Q-LEARNING: Procesar experiencias DESPUÉS del update
// ============================================================
function processQLearningExperiences() {
  for (const car of cars) {
    const prevState = prevCarStates.get(car.id);
    if (!prevState) continue;

    const currentSensors = car.sensor?.readings.map((s: any) => s == null ? 0 : 1 - s.offset) || [];

    // Calcular recompensa
    const reward = DQNAgent.calculateReward(
      prevState.y,
      car.y,
      car.damaged,
      car.overtakeCount,
      prevState.overtakes,
      car.speed,
      currentSensors,
      car.angle
    );

    // Almacenar experiencia
    dqnAgent.storeExperience({
      state: prevState.sensors,
      action: car.externalActions || [1, 0],
      reward,
      nextState: currentSensors,
      done: car.damaged
    });

    // Actualizar estado previo para siguiente frame
    prevCarStates.set(car.id, {
      y: car.y,
      overtakes: car.overtakeCount,
      sensors: currentSensors,
      angle: car.angle
    });
  }

  // Entrenar cada ciertos frames
  if (frameCount % 5 === 0) {
    dqnAgent.train();
  }

  // Actualizar estadísticas de UI
  if (explorationLabel) {
    explorationLabel.textContent = (dqnAgent.stats.explorationRate * 100).toFixed(1) + '%';
  }
  if (episodeCountLabel) {
    episodeCountLabel.textContent = dqnAgent.stats.episodesCompleted.toString();
  }
}

// Slider de largo de sensores
const sensorSlider = document.getElementById("sensorRange") as HTMLInputElement;
const sensorValue = document.getElementById("sensorValue") as HTMLSpanElement;

if (sensorSlider) {
  sensorSlider.min = SensorConfig.minRayLength.toString();
  sensorSlider.max = SensorConfig.maxRayLength.toString();
  sensorSlider.value = SensorConfig.rayLength.toString();
  if (sensorValue) sensorValue.textContent = SensorConfig.rayLength.toString();

  sensorSlider.addEventListener("input", () => {
    const newLength = parseInt(sensorSlider.value);
    SensorConfig.rayLength = newLength;
    if (sensorValue) sensorValue.textContent = newLength.toString();
  });
}

// Control de velocidad de simulación
const speedButtons = document.querySelectorAll(".speed-btn");
const speedIndicator = document.getElementById("speedIndicator") as HTMLSpanElement;

function updateSpeedUI() {
  speedButtons.forEach(btn => {
    const scale = parseInt(btn.getAttribute("data-speed") || "1");
    btn.classList.toggle("active", scale === timeScale);
  });
  if (speedIndicator) {
    if (timeScale === 0) {
      speedIndicator.textContent = "⏸ PAUSA";
      speedIndicator.style.background = "rgba(248, 113, 113, 0.2)";
      speedIndicator.style.color = "#f87171";
    } else if (timeScale === 1) {
      speedIndicator.textContent = "Tiempo Real";
      speedIndicator.style.background = "rgba(74, 222, 128, 0.15)";
      speedIndicator.style.color = "#4ade80";
    } else {
      speedIndicator.textContent = `${timeScale}x`;
      speedIndicator.style.background = "rgba(251, 191, 36, 0.15)";
      speedIndicator.style.color = "#fbbf24";
    }
  }
}

speedButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const newScale = parseInt(btn.getAttribute("data-speed") || "1");
    timeScale = newScale;
    updateSpeedUI();
  });
});

// Atajos de teclado para velocidad
document.addEventListener("keydown", (e) => {
  if (e.key === "1") { timeScale = 1; updateSpeedUI(); }
  else if (e.key === "2") { timeScale = 2; updateSpeedUI(); }
  else if (e.key === "3") { timeScale = 4; updateSpeedUI(); }
  else if (e.key === "4") { timeScale = 8; updateSpeedUI(); }
  else if (e.key === "5") { timeScale = 16; updateSpeedUI(); }
  else if (e.key === " ") { // Espacio para pausar/reanudar
    e.preventDefault();
    timeScale = timeScale === 0 ? 1 : 0;
    updateSpeedUI();
  }
});

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Retorna color según la distancia (progreso visual)
function getDistanceColor(distance: number): string {
  if (distance >= 12000) return "#fbbf24"; // Dorado - legendario
  if (distance >= 8000) return "#ef4444";  // Rojo - extremo
  if (distance >= 5000) return "#ec4899";  // Rosa - experto
  if (distance >= 3000) return "#8b5cf6";  // Violeta - avanzado
  if (distance >= 2000) return "#38bdf8";  // Azul - intermedio
  if (distance >= 1000) return "#22d3ee";  // Cyan - principiante+
  return "#4ade80";                         // Verde - inicio
}

function animate() {
  // FPS calculation
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastTime = now;
    if (fpsCounter) fpsCounter.textContent = fps.toString();
  }

  // ============================================================
  // TIME SCALE: Ejecutar múltiples pasos de simulación por frame
  // ============================================================
  // Limitar generaciones por frame para evitar loops infinitos
  const MAX_GENERATIONS_PER_FRAME = 3;
  let generationsThisFrame = 0;

  // Solo simular si no está pausado (timeScale > 0)
  if (timeScale > 0) {
    for (let step = 0; step < timeScale; step++) {
      // Update traffic
      for (let i = 0; i < traffic.length; i++) {
        traffic[i].update(road.borders);
      }

      // Q-Learning: establecer acciones ANTES del update
      if (currentLearningMode === 'qlearning') {
        setQLearningActions();
      }

      // Update AI cars
      for (let i = 0; i < cars.length; i++) {
        cars[i].update(road.borders, traffic);
      }

      // Q-Learning: procesar experiencias DESPUÉS del update
      if (currentLearningMode === 'qlearning') {
        processQLearningExperiences();
      }

      // Spawn more traffic as leader advances
      const activeCarsInStep = cars.filter(c => !c.damaged);
      if (activeCarsInStep.length > 0) {
        const leader = activeCarsInStep.reduce((best, car) => car.y < best.y ? car : best, activeCarsInStep[0]);
        updateTraffic(leader.y);
      }

      // Check if generation ended (all crashed)
      const aliveCount = cars.filter(c => !c.damaged).length;
      if (aliveCount === 0) {
        nextGeneration();
        generationsThisFrame++;

        // Prevenir loops infinitos - máximo N generaciones por frame
        if (generationsThisFrame >= MAX_GENERATIONS_PER_FRAME) {
          break;
        }
      }
    }
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

  // Smooth camera movement - adaptativo según velocidad
  const targetCameraY = visualBestCar.y;
  // A mayor velocidad, cámara más rápida para no perder al líder
  const adaptiveSmoothness = Math.min(CAMERA_SMOOTHNESS * (1 + timeScale * 0.5), 0.8);
  cameraY = lerp(cameraY, targetCameraY, adaptiveSmoothness);

  carCanvas.height = window.innerHeight * 0.9; // clear
  networkCanvas.height = 300;

  carCtx.save();
  carCtx.translate(0, -cameraY + carCanvas.height * 0.7);

  road.draw(carCtx, cameraY);

  // Draw traffic (obstacles) - el color se maneja internamente
  for (let i = 0; i < traffic.length; i++) {
    traffic[i].draw(carCtx, "#fb923c");
  }

  // Draw all AI cars (semi-transparentes)
  carCtx.globalAlpha = 0.35;
  for (let i = 0; i < cars.length; i++) {
    if (cars[i] !== visualBestCar) {
      cars[i].draw(carCtx, "#38bdf8");
    }
  }
  carCtx.globalAlpha = 1;

  // Draw leader (sin glow extra, ya tiene shadow interno)
  visualBestCar.draw(carCtx, "#38bdf8", true);

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

  // Cambiar color de distancia según el progreso
  const distanceColor = getDistanceColor(maxDistance);
  fitnessLabel.style.color = distanceColor;
  const fitnessCard = fitnessLabel.parentElement;
  if (fitnessCard) {
    fitnessCard.style.borderLeftColor = distanceColor;
    fitnessCard.style.background = `${distanceColor}15`; // 15 = ~8% opacity in hex
  }

  // Update status bar
  if (aliveCount > 0) {
    deathReasonLabel.innerText = `${aliveCount} en carrera...`;
    statusBar.className = 'status-bar status-racing';
  } else {
    deathReasonLabel.innerText = 'Generación terminada';
    statusBar.className = 'status-bar status-crashed';
  }

  // Network Visualizer
  networkCtx.lineDashOffset = -performance.now() / 50;
  if (visualBestCar.brain) {
    Visualizer.drawNetwork(networkCtx, visualBestCar.brain);
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

  // Para Q-Learning: terminar episodio y procesar experiencias finales
  if (currentLearningMode === 'qlearning') {
    // Registrar experiencias de colisión para todos los coches dañados
    for (const car of cars) {
      if (car.damaged) {
        const prevState = prevCarStates.get(car.id);
        if (prevState) {
          dqnAgent.storeExperience({
            state: prevState.sensors,
            action: car.lastOutputs || [0, 0],
            reward: -100, // Penalización por colisión
            nextState: prevState.sensors,
            done: true
          });
        }
      }
    }
    dqnAgent.endEpisode();
    prevCarStates.clear();
  }

  // Get behavioral analysis from best car
  const bestCarSummary = bestCar.getSummary();
  const currentBestDistance = Math.abs(100 - bestCar.y);

  // ============================================================
  // AUTO-SAVE: Guardar si es el mejor cerebro de todos los tiempos
  // ============================================================
  if (currentBestDistance > allTimeBestDistance) {
    allTimeBestDistance = currentBestDistance;
    localStorage.setItem("allTimeBestDistance", allTimeBestDistance.toString());
    if (bestCar.brain) {
      localStorage.setItem("bestBrain", JSON.stringify(bestCar.brain));
      addFeedItem({
        type: 'milestone',
        message: `Cerebro guardado: ${Math.round(allTimeBestDistance)}m`,
        icon: '💾'
      });
    }
  }

  // Create generation summary for logging
  const genSummary: GenerationSummary = {
    generation: generation,
    bestCarId: bestCar.id,
    totalOvertakes: bestCar.overtakeCount,
    maxDistance: currentBestDistance,
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

  // ============================================================
  // MODO Q-LEARNING: Habilitar acciones externas
  // ============================================================
  if (currentLearningMode === 'qlearning') {
    for (const car of nextCars) {
      car.useExternalActions = true;
      car.externalActions = [1, 0]; // Iniciar yendo recto
      car.brain = dqnAgent.getNetwork(); // Para visualización
    }
  } else {
    // ============================================================
    // MODO GENÉTICO: Evolución tradicional
    // ============================================================
    const baseMutationRate = 0.15; // Tasa de mutación fija

    // SELECCIÓN MEJORADA: Usar top 3 como padres
    const topParents = sortedCars.slice(0, 3).filter(c => c.brain);

    // INYECCIÓN DE DIVERSIDAD: Cada N generaciones, añadir cerebros frescos
    const injectDiversity = generation % DIVERSITY_INJECTION_INTERVAL === 0;
    const diversityCount = injectDiversity ? Math.floor(N * DIVERSITY_RATIO) : 0;

    if (injectDiversity) {
      addFeedItem({
        type: 'learning',
        message: `Inyectando ${diversityCount} cerebros nuevos`,
        icon: '🔄'
      });
    }

    for (let i = 0; i < nextCars.length; i++) {
      if (i < diversityCount) {
        // Cerebros completamente nuevos (inyección de diversidad)
        // El carro ya viene con un cerebro aleatorio del constructor
        continue;
      }

      // Seleccionar padre de los top 3
      const parentIndex = i % topParents.length;
      const parent = topParents[parentIndex];

      if (parent && parent.brain) {
        nextCars[i].brain = JSON.parse(JSON.stringify(parent.brain));

        if (i !== 0 && nextCars[i].brain) {
          // Variable mutation: algunos con cambios pequeños, otros con cambios grandes
          let mutationRate: number;
          if (i < N * 0.2) {
            // 20% con mutación baja (explotar lo que funciona)
            mutationRate = baseMutationRate * 0.3;
          } else if (i < N * 0.6) {
            // 40% con mutación media
            mutationRate = baseMutationRate;
          } else {
            // 40% restante con mutación alta (explorar nuevas soluciones)
            mutationRate = baseMutationRate * (1.5 + Math.random());
          }
          Network.mutate(nextCars[i].brain!, mutationRate);
        }
      }
    }
  }

  cars = nextCars;

  // Garantizar que todos los carros arranquen correctamente
  ensureCarsStartMoving(cars);

  cameraY = 100;

  // Reset tracking for new generation
  lastOvertakeCount = 0;

  // Reset traffic system for new generation
  furthestY = TRAFFIC_START_Y - (INITIAL_TRAFFIC_ROWS - 1) * TRAFFIC_SPAWN_DISTANCE;
  spawnedRows = INITIAL_TRAFFIC_ROWS;
  traffic = createTraffic();
}

// Asegura que los carros AI tengan estado inicial correcto
function ensureCarsStartMoving(carList: Car[]) {
  for (const car of carList) {
    if (car.controlType === "AI" && !car.damaged) {
      car.speed = Math.max(car.speed, 1);
      car.controls.forward = true;
      car.angle = 0; // Asegurar orientación correcta (hacia arriba)
    }
  }
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

animate();
