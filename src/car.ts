import { Sensor } from "./sensor";
import { Network } from "./network";

// ============================================================
// AI LEARNING LOG SYSTEM
// Captures decisions and context for analysis
// ============================================================
export interface DecisionLog {
  frame: number;
  timestamp: number;
  // Context
  position: { x: number; y: number };
  speed: number;
  angle: number;
  lane: number; // Estimated lane (0, 1, 2)
  // Sensor readings (normalized 0-1, where 1 = obstacle very close)
  sensors: number[];
  // Neural network outputs (raw)
  outputs: number[];
  // Interpreted actions
  actions: {
    accelerating: boolean;
    turningLeft: boolean;
    turningRight: boolean;
  };
  // Events
  event?: "OVERTAKE" | "NEAR_MISS" | "LANE_CHANGE" | "COLLISION" | "STAGNATION_DEATH";
  overtakeCount: number;
  distanceTraveled: number;
}

export interface GenerationSummary {
  generation: number;
  bestCarId: number;
  totalOvertakes: number;
  maxDistance: number;
  survivalFrames: number;
  deathReason: "COLLISION" | "STAGNATION" | "NO_PROGRESS" | "ALIVE";
  // Behavioral patterns detected
  patterns: string[];
  // Key decisions that led to success/failure
  keyMoments: DecisionLog[];
}

// Global log storage - accessible for analysis
export const AILearningLog = {
  currentGeneration: 1,
  generationSummaries: [] as GenerationSummary[],
  bestCarLogs: [] as DecisionLog[],

  // For pattern analysis
  getLastNGenerations(n: number): GenerationSummary[] {
    return this.generationSummaries.slice(-n);
  },

  // Export for analysis
  exportToJSON(): string {
    return JSON.stringify({
      generations: this.generationSummaries,
      bestCarDecisions: this.bestCarLogs
    }, null, 2);
  },

  // Clear old data to prevent memory issues
  pruneOldData(keepGenerations: number = 50) {
    if (this.generationSummaries.length > keepGenerations) {
      this.generationSummaries = this.generationSummaries.slice(-keepGenerations);
    }
  }
};

export class Car {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number = 0;
  acceleration: number = 0.2;
  maxSpeed: number;
  friction: number = 0.05;
  angle: number = 0;
  damaged: boolean = false;
  controlType: "AI" | "KEYS" | "DUMMY";

  // ============================================================
  // ANTI-EXPLOIT: Overtake-based progression
  // Car MUST overtake traffic to survive, not just move forward
  // ============================================================
  overtakenCars: Set<Car> = new Set(); // Track which cars we've passed
  overtakeCount: number = 0;
  framesSinceLastOvertake: number = 0;
  static readonly OVERTAKE_TIMEOUT = 120; // 2 seconds without overtaking = death (reduced since traffic is dense)
  static readonly GRACE_PERIOD = 90; // 1.5 seconds grace at start

  // Stagnation detection - backup check
  bestY: number = Infinity;
  stagnationFrames: number = 0;
  static readonly STAGNATION_LIMIT = 90; // 1.5 seconds without any forward progress

  // Track movement direction to detect oscillation (vaivén)
  previousY: number;
  directionChanges: number = 0;
  static readonly MAX_DIRECTION_CHANGES = 8;
  lastDirection: number = 0;

  sensor: Sensor | null = null;
  brain: Network | null = null;
  controls: { forward: boolean; left: boolean; right: boolean; reverse: boolean };
  fitness: number = 0;

  // Continuous steering for smooth turns (-1 = full left, 1 = full right)
  steeringIntensity: number = 0;

  // ============================================================
  // LOGGING SYSTEM
  // ============================================================
  id: number;
  static nextId: number = 0;
  decisionLog: DecisionLog[] = [];
  frameCount: number = 0;
  lastOutputs: number[] = [];
  deathReason: "COLLISION" | "STAGNATION" | "NO_PROGRESS" | "ALIVE" = "ALIVE";

  // Display number for visual identification
  displayNumber: number = 0;

  // Tipo de obstáculo para renderizado diferente
  obstacleType: 'car' | 'barrier' | 'danger' = 'car';

  constructor(x: number, y: number, width: number, height: number, controlType: "AI" | "KEYS" | "DUMMY" = "AI", maxSpeed: number = 3) {
    this.x = x;
    this.y = y;
    this.bestY = y;
    this.previousY = y;
    this.width = width;
    this.height = height;
    this.maxSpeed = maxSpeed;
    this.controlType = controlType;
    this.id = Car.nextId++;

    this.controls = { forward: false, left: false, right: false, reverse: false };

    if (controlType === "AI") {
      this.sensor = new Sensor(this);
      // Network: 7 sensors -> 8 hidden neurons -> 2 outputs (accel, steer)
      this.brain = new Network([this.sensor.rayCount, 8, 2]);
      // Impulso inicial - todos parten moviéndose
      this.speed = 1;
      this.controls.forward = true;
    }

    if (controlType === "KEYS") {
      this.sensor = new Sensor(this);
      this.#addKeyboardListeners();
    }

    if (controlType === "DUMMY") {
      this.controls.forward = true;
    }
  }

  update(roadBorders: { x: number; y: number }[][], traffic: Car[] = []) {
    if (!this.damaged) {
      this.#move();
      this.frameCount++;

      let sensorOffsets: number[] = [];

      if (this.sensor) {
        this.sensor.update(roadBorders, traffic);
        sensorOffsets = this.sensor.readings.map((s: any) => s == null ? 0 : 1 - s.offset);

        if (this.brain) {
          const outputs = Network.feedForward(sensorOffsets, this.brain);
          this.lastOutputs = [...outputs];

          // CONTINUOUS CONTROL:
          // output[0]: acceleration intensity (-1 to 1)
          // output[1]: steering (-1 = full left, 0 = straight, 1 = full right)

          // Acceleration: casi siempre acelerar (threshold bajo)
          const accelIntensity = (outputs[0] + 1) / 2; // 0 to 1
          this.controls.forward = accelIntensity > 0.1; // Solo frena si output muy negativo

          // Steering: continuous value stored for smooth turning
          this.steeringIntensity = outputs[1]; // -1 to 1

          this.controls.left = false;
          this.controls.right = false;
          this.controls.reverse = false;
        }
      }

      // Only AI cars check for collision
      if (this.controlType !== "DUMMY") {
        this.#assessDamage(roadBorders, traffic);

        if (this.damaged) {
          this.deathReason = "COLLISION";
          this.#logDecision(sensorOffsets, "COLLISION");
          return;
        }

        // Track overtakes for stats (optional, no death penalty)
        for (const trafficCar of traffic) {
          if (this.y < trafficCar.y - 30 && !this.overtakenCars.has(trafficCar)) {
            this.overtakenCars.add(trafficCar);
            this.overtakeCount++;
            this.#logDecision(sensorOffsets, "OVERTAKE");
          }
        }

        // STAGNATION DETECTION: Penalizar autos que giran en círculos
        // Solo después del período de gracia inicial
        if (this.frameCount > Car.GRACE_PERIOD) {
          // Detectar si está avanzando (Y debe disminuir)
          if (this.y < this.bestY - 5) {
            // Progreso real - reset stagnation
            this.bestY = this.y;
            this.stagnationFrames = 0;
          } else {
            // Sin progreso
            this.stagnationFrames++;
          }

          // Matar por estancamiento (girando en círculos sin avanzar)
          if (this.stagnationFrames > Car.STAGNATION_LIMIT) {
            this.damaged = true;
            this.deathReason = "STAGNATION";
            this.#logDecision(sensorOffsets, "STAGNATION_DEATH");
            return;
          }
        }
      }

      // FITNESS = DISTANCE TRAVELED (simple and clear)
      // Lower Y = further traveled (Y decreases as car moves forward)
      this.fitness = 100 - this.y; // Distance in "meters"

      // Log decisions periodically (every 60 frames) for analysis
      if (this.frameCount % 60 === 0) {
        this.#logDecision(sensorOffsets);
      }
    }
  }

  // ============================================================
  // LOGGING: Capture decision context for analysis
  // ============================================================
  #logDecision(sensors: number[], event?: DecisionLog["event"]) {
    if (this.controlType !== "AI") return;

    // Estimate lane based on X position (rough approximation)
    const laneWidth = 50; // Approximate lane width
    const lane = Math.round(this.x / laneWidth) - 1;

    const log: DecisionLog = {
      frame: this.frameCount,
      timestamp: Date.now(),
      position: { x: this.x, y: this.y },
      speed: this.speed,
      angle: this.angle,
      lane: Math.max(0, Math.min(2, lane)),
      sensors: [...sensors],
      outputs: [...this.lastOutputs],
      actions: {
        accelerating: this.controls.forward,
        turningLeft: this.controls.left,
        turningRight: this.controls.right
      },
      event,
      overtakeCount: this.overtakeCount,
      distanceTraveled: 100 - this.y
    };

    this.decisionLog.push(log);

    // Keep only last 200 entries to prevent memory issues
    if (this.decisionLog.length > 200) {
      this.decisionLog = this.decisionLog.slice(-200);
    }
  }

  // Get summary of this car's behavior for generation analysis
  getSummary(): { patterns: string[], keyMoments: DecisionLog[] } {
    const patterns: string[] = [];

    // Analyze behavior patterns
    const avgSpeed = this.decisionLog.reduce((sum, d) => sum + d.speed, 0) / Math.max(1, this.decisionLog.length);

    if (this.overtakeCount === 0) {
      patterns.push("PASSIVE: Never overtook any car");
    } else if (this.overtakeCount >= 5) {
      patterns.push(`AGGRESSIVE: Overtook ${this.overtakeCount} cars`);
    }

    if (avgSpeed < 1) {
      patterns.push("SLOW: Average speed very low - possible exploit attempt");
    } else if (avgSpeed > 3) {
      patterns.push("FAST: Maintaining high speed");
    }

    // Check for lane preferences
    const laneCounts = [0, 0, 0];
    this.decisionLog.forEach(d => laneCounts[d.lane]++);
    const preferredLane = laneCounts.indexOf(Math.max(...laneCounts));
    patterns.push(`LANE_PREF: Mostly lane ${preferredLane}`);

    // Key moments: first overtake, death, near misses
    const keyMoments = this.decisionLog.filter(d => d.event);

    return { patterns, keyMoments };
  }

  #assessDamage(roadBorders: { x: number; y: number }[][], traffic: Car[]) {
    for (let i = 0; i < roadBorders.length; i++) {
      const border = roadBorders[i];
      if (this.#polysIntersect(this.getPolygon(), border)) {
        this.damaged = true;
        return;
      }
    }
    for (let i = 0; i < traffic.length; i++) {
      if (this.#polysIntersect(this.getPolygon(), traffic[i].getPolygon())) {
        this.damaged = true;
        return;
      }
    }
  }

  getPolygon() {
    const points = [];
    const rad = Math.hypot(this.width, this.height) / 2;
    const alpha = Math.atan2(this.width, this.height);
    points.push({
      x: this.x - Math.sin(this.angle - alpha) * rad,
      y: this.y - Math.cos(this.angle - alpha) * rad
    });
    points.push({
      x: this.x - Math.sin(this.angle + alpha) * rad,
      y: this.y - Math.cos(this.angle + alpha) * rad
    });
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle - alpha) * rad,
      y: this.y - Math.cos(Math.PI + this.angle - alpha) * rad
    });
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle + alpha) * rad,
      y: this.y - Math.cos(Math.PI + this.angle + alpha) * rad
    });
    return points;
  }

  #polysIntersect(poly1: { x: number; y: number }[], poly2: { x: number; y: number }[]) {
    for (let i = 0; i < poly1.length; i++) {
      for (let j = 0; j < poly2.length - 1; j++) {
        const touch = this.#getIntersection(
          poly1[i],
          poly1[(i + 1) % poly1.length],
          poly2[j],
          poly2[j + 1]
        );
        if (touch) return true;
      }
    }
    return false;
  }

  #getIntersection(A: any, B: any, C: any, D: any) {
    const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x);
    const uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y);
    const bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);

    if (bottom != 0) {
      const t = tTop / bottom;
      const u = uTop / bottom;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
          x: A.x + (B.x - A.x) * t,
          y: A.y + (B.y - A.y) * t,
          offset: t
        };
      }
    }
    return null;
  }

  #move() {
    if (this.controls.forward) this.speed += this.acceleration;
    if (this.controls.reverse) this.speed -= this.acceleration;

    if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    if (this.speed < -this.maxSpeed / 2) this.speed = -this.maxSpeed / 2;

    if (this.speed > 0) this.speed -= this.friction;
    if (this.speed < 0) this.speed += this.friction;

    // AI cars SIEMPRE mantienen velocidad mínima - no pueden detenerse
    // Esto fuerza a que evolucionen para esquivar, no para quedarse quietos
    const MIN_AI_SPEED = 1.5;
    if (this.controlType === "AI" && !this.damaged && this.speed < MIN_AI_SPEED) {
      this.speed = MIN_AI_SPEED;
    }

    if (Math.abs(this.speed) < this.friction && this.controlType !== "AI") this.speed = 0;

    if (this.speed != 0) {
      const flip = this.speed > 0 ? 1 : -1;

      // CONTINUOUS STEERING: use steeringIntensity for smooth turns
      // steeringIntensity: -1 = full left, 0 = straight, 1 = full right
      // Max turn rate: 0.04 radians per frame
      const turnRate = 0.04;
      this.angle -= this.steeringIntensity * turnRate * flip;

      // Also support binary controls for KEYS mode
      if (this.controls.left) this.angle += 0.03 * flip;
      if (this.controls.right) this.angle -= 0.03 * flip;
    }

    this.x -= Math.sin(this.angle) * this.speed;
    this.y -= Math.cos(this.angle) * this.speed;
  }

  draw(ctx: CanvasRenderingContext2D, _color: string, drawSensor: boolean = false) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(-this.angle);

    const w = this.width;
    const h = this.height;
    const isTraffic = this.controlType === "DUMMY";

    // Diferentes estilos según tipo de obstáculo
    if (isTraffic && this.obstacleType === 'barrier') {
      // BARRERA GRIS (camión/muro)
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 3);
      ctx.fillStyle = this.damaged ? "#3a4459" : "#64748b";
      ctx.fill();
      ctx.strokeStyle = "rgba(100, 116, 139, 0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Líneas horizontales decorativas
      ctx.strokeStyle = "rgba(30, 35, 49, 0.5)";
      ctx.lineWidth = 1;
      for (let i = -h/3; i < h/2; i += 15) {
        ctx.beginPath();
        ctx.moveTo(-w/2 + 4, i);
        ctx.lineTo(w/2 - 4, i);
        ctx.stroke();
      }
    } else if (isTraffic && this.obstacleType === 'danger') {
      // ZONA ROJA (peligro horizontal)
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 2);
      ctx.fillStyle = this.damaged ? "#4a566d" : "#991b1b";
      ctx.fill();
      ctx.strokeStyle = "rgba(220, 38, 38, 0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Patrón de peligro (rayas)
      ctx.fillStyle = "rgba(252, 165, 165, 0.4)";
      for (let i = -w/2; i < w/2; i += 12) {
        ctx.fillRect(i, -h/2 + 2, 6, h - 4);
      }
    } else {
      // AUTO NORMAL (naranja o azul)
      const radius = 5;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, radius);

      if (this.damaged) {
        ctx.fillStyle = "#4a566d";
      } else if (isTraffic) {
        ctx.fillStyle = "#fb923c";
      } else {
        ctx.fillStyle = "#38bdf8";
      }
      ctx.fill();

      // Borde
      ctx.strokeStyle = this.damaged
        ? "rgba(148, 163, 184, 0.3)"
        : isTraffic
          ? "rgba(234, 88, 12, 0.6)"
          : "rgba(14, 165, 233, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Ventana (solo si no está dañado)
      if (!this.damaged) {
        ctx.fillStyle = "#1e2331";
        ctx.beginPath();
        ctx.roundRect(-w * 0.35, -h * 0.32, w * 0.7, h * 0.28, 2);
        ctx.fill();
      }

      // Luces traseras
      if (!this.damaged) {
        ctx.fillStyle = isTraffic ? "#fbbf24" : "#ef4444";
        ctx.fillRect(-w / 2 + 2, h / 2 - 5, 4, 3);
        ctx.fillRect(w / 2 - 6, h / 2 - 5, 4, 3);
      }

      // Luces delanteras
      if (!this.damaged) {
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(-w / 2 + 2, -h / 2 + 2, 4, 3);
        ctx.fillRect(w / 2 - 6, -h / 2 + 2, 4, 3);
      }

      // Numero (solo AI con displayNumber)
      if (this.displayNumber > 0 && this.controlType === "AI") {
        ctx.fillStyle = this.damaged ? "rgba(148, 163, 184, 0.5)" : "#1e2331";
        ctx.font = "bold 9px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.displayNumber.toString(), 0, h * 0.15);
      }
    }

    ctx.restore();

    if (this.sensor && drawSensor) {
      this.sensor.draw(ctx);
    }
  }

  #addKeyboardListeners() {
    document.onkeydown = (event) => {
      switch (event.key) {
        case "ArrowLeft": this.controls.left = true; break;
        case "ArrowRight": this.controls.right = true; break;
        case "ArrowUp": this.controls.forward = true; break;
        case "ArrowDown": this.controls.reverse = true; break;
      }
    };
    document.onkeyup = (event) => {
      switch (event.key) {
        case "ArrowLeft": this.controls.left = false; break;
        case "ArrowRight": this.controls.right = false; break;
        case "ArrowUp": this.controls.forward = false; break;
        case "ArrowDown": this.controls.reverse = false; break;
      }
    };
  }
}
