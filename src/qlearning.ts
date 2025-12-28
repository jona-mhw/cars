// ============================================================
// DEEP Q-LEARNING (DQN) - Aprendizaje por Refuerzo
// ============================================================
// A diferencia del algoritmo genético que evoluciona poblaciones,
// DQN aprende de la experiencia acumulada usando recompensas.

import { Network } from './network';

// Experiencia: estado, acción, recompensa, siguiente estado, terminado
export interface Experience {
  state: number[];           // Lecturas de sensores
  action: number[];          // Acción tomada [aceleración, dirección]
  reward: number;            // Recompensa recibida
  nextState: number[];       // Siguiente estado
  done: boolean;             // ¿Episodio terminado?
}

// Configuración de Q-Learning
export const QLearningConfig = {
  learningRate: 0.003,       // Tasa de aprendizaje (α)
  discountFactor: 0.9,       // Factor de descuento (γ) - prioriza recompensas inmediatas
  explorationRate: 0.2,      // Tasa de exploración inicial (ε) - muy baja para ir recto
  explorationDecay: 0.995,   // Decaimiento gradual
  minExploration: 0.05,      // Exploración mínima
  batchSize: 32,             // Tamaño del lote para entrenamiento
  memorySize: 10000,         // Tamaño máximo de memoria de experiencias
  targetUpdateFreq: 30,      // Actualización frecuente de red objetivo
};

// ============================================================
// REPLAY BUFFER - Memoria de experiencias
// ============================================================
export class ReplayBuffer {
  private buffer: Experience[] = [];
  private maxSize: number;

  constructor(maxSize: number = QLearningConfig.memorySize) {
    this.maxSize = maxSize;
  }

  add(experience: Experience): void {
    if (this.buffer.length >= this.maxSize) {
      // Eliminar experiencia más antigua
      this.buffer.shift();
    }
    this.buffer.push(experience);
  }

  sample(batchSize: number): Experience[] {
    const samples: Experience[] = [];
    const indices = new Set<number>();

    const actualBatchSize = Math.min(batchSize, this.buffer.length);

    while (indices.size < actualBatchSize) {
      const idx = Math.floor(Math.random() * this.buffer.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        samples.push(this.buffer[idx]);
      }
    }

    return samples;
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}

// ============================================================
// DQN AGENT - Agente de Q-Learning Profundo
// ============================================================
export class DQNAgent {
  private qNetwork: Network;           // Red Q principal
  private targetNetwork: Network;      // Red objetivo (para estabilidad)
  private replayBuffer: ReplayBuffer;
  private explorationRate: number;
  private stepCount: number = 0;
  private episodeCount: number = 0;
  private totalReward: number = 0;

  // Estadísticas para UI
  public stats = {
    avgReward: 0,
    maxReward: 0,
    explorationRate: 1.0,
    episodesCompleted: 0,
    lossHistory: [] as number[],
  };

  constructor(inputSize: number = 7, hiddenSize: number = 12, outputSize: number = 2) {
    // Red con más capacidad para Q-Learning
    this.qNetwork = new Network([inputSize, hiddenSize, outputSize]);
    // Inicializar con pesos pequeños para evitar sesgos
    this.initializeNetworkBalanced(this.qNetwork);
    this.targetNetwork = this.cloneNetwork(this.qNetwork);
    this.replayBuffer = new ReplayBuffer();
    this.explorationRate = QLearningConfig.explorationRate;
  }

  // Inicializar pesos pequeños y centrados en cero
  private initializeNetworkBalanced(network: Network): void {
    for (const level of network.levels) {
      for (let i = 0; i < level.weights.length; i++) {
        for (let j = 0; j < level.weights[i].length; j++) {
          // Pesos pequeños [-0.3, 0.3]
          level.weights[i][j] = (Math.random() - 0.5) * 0.6;
        }
      }
      for (let i = 0; i < level.biases.length; i++) {
        // Biases muy pequeños [-0.1, 0.1]
        level.biases[i] = (Math.random() - 0.5) * 0.2;
      }
    }
  }

  // Clonar red neuronal
  private cloneNetwork(network: Network): Network {
    const clone = new Network([1, 1]); // Placeholder
    clone.levels = JSON.parse(JSON.stringify(network.levels));
    return clone;
  }

  // Seleccionar acción basada en sensores
  selectAction(state: number[]): number[] {
    // En las primeras generaciones, usar heurística simple basada en sensores
    if (this.episodeCount < 5) {
      return this.heuristicAction(state);
    }

    // Exploración: mezcla de heurística y aleatorio
    if (Math.random() < this.explorationRate) {
      // 70% heurística, 30% aleatorio suave
      if (Math.random() < 0.7) {
        return this.heuristicAction(state);
      }
      return [
        0.8 + Math.random() * 0.2,  // Aceleración alta
        (Math.random() - 0.5) * 0.3  // Giro suave
      ];
    }

    // Explotación: usar red Q
    const output = Network.feedForward(state, this.qNetwork);

    // Forzar que la aceleración sea siempre positiva
    output[0] = Math.max(0.5, output[0]);

    // Limitar giros
    output[1] = Math.max(-0.6, Math.min(0.6, output[1]));

    return output;
  }

  // Acción heurística basada en sensores (baseline inteligente)
  private heuristicAction(state: number[]): number[] {
    // state: 7 sensores, valores altos = obstáculo cerca
    // Sensores: izquierda-lejano, izquierda, izquierda-centro, centro, derecha-centro, derecha, derecha-lejano

    const accel = 0.9; // Siempre acelerar
    let steer = 0;

    if (state.length >= 7) {
      const leftSide = (state[0] + state[1] + state[2]) / 3;
      const rightSide = (state[4] + state[5] + state[6]) / 3;
      const center = state[3];

      // Si hay obstáculo al frente, girar hacia el lado más libre
      if (center > 0.5) {
        if (leftSide < rightSide) {
          steer = -0.4; // Girar izquierda (lado más libre)
        } else {
          steer = 0.4;  // Girar derecha
        }
      } else if (center > 0.3) {
        // Obstáculo moderado, girar suavemente
        if (leftSide < rightSide) {
          steer = -0.2;
        } else {
          steer = 0.2;
        }
      } else {
        // Camino libre, ir recto con pequeña corrección
        steer = (rightSide - leftSide) * 0.3;
      }
    }

    return [accel, steer];
  }

  // Almacenar experiencia
  storeExperience(experience: Experience): void {
    this.replayBuffer.add(experience);
    this.totalReward += experience.reward;
  }

  // Calcular recompensa basada en el estado del coche
  static calculateReward(
    prevY: number,
    currentY: number,
    damaged: boolean,
    overtakeCount: number,
    prevOvertakes: number,
    speed: number,
    sensorReadings: number[],
    angle: number = 0
  ): number {
    let reward = 0;

    // Penalización por colisión
    if (damaged) {
      return -50;
    }

    // RECOMPENSA PRINCIPAL: avanzar (Y disminuye al avanzar)
    const progress = prevY - currentY;

    if (progress > 0) {
      // Avanzando: recompensa proporcional
      reward += progress * 5;
    } else {
      // Retrocediendo o estancado: penalización fuerte
      reward += progress * 10; // Negativo, así que penaliza
      reward -= 2; // Penalización adicional por no avanzar
    }

    // Recompensa por adelantar
    if (overtakeCount > prevOvertakes) {
      reward += (overtakeCount - prevOvertakes) * 15;
    }

    // Recompensa por mantener buena velocidad
    if (speed > 2.5) {
      reward += 1;
    } else if (speed > 1.5) {
      reward += 0.3;
    } else {
      reward -= 2; // Penalización fuerte por ir muy lento
    }

    // PENALIZACIÓN POR ÁNGULO: evitar giros excesivos
    // angle cerca de 0 = recto hacia adelante
    const absAngle = Math.abs(angle);
    if (absAngle > 0.5) {
      // Girando demasiado (más de ~30 grados)
      reward -= absAngle * 3;
    } else if (absAngle < 0.1) {
      // Casi recto: pequeño bonus
      reward += 0.2;
    }

    // Penalización por estar muy cerca de obstáculos frontales
    if (sensorReadings.length > 0) {
      const frontSensor = sensorReadings[Math.floor(sensorReadings.length / 2)];
      if (frontSensor > 0.9) {
        reward -= 5; // Muy cerca de obstáculo frontal
      } else if (frontSensor > 0.7) {
        reward -= 1;
      }
    }

    return reward;
  }

  // Entrenar con un lote de experiencias
  train(): number {
    if (this.replayBuffer.size() < QLearningConfig.batchSize) {
      return 0; // No hay suficientes experiencias
    }

    const batch = this.replayBuffer.sample(QLearningConfig.batchSize);
    let totalLoss = 0;

    for (const exp of batch) {
      // Calcular Q-value objetivo
      const currentQ = Network.feedForward(exp.state, this.qNetwork);
      const targetQ = [...currentQ];

      if (exp.done) {
        // Estado terminal: Q = recompensa directa
        targetQ[0] = exp.reward;
        targetQ[1] = exp.reward;
      } else {
        // Q(s,a) = r + γ * max(Q(s', a'))
        const nextQ = Network.feedForward(exp.nextState, this.targetNetwork);
        const maxNextQ = Math.max(...nextQ);

        // Actualizar solo las acciones tomadas
        targetQ[0] = exp.reward + QLearningConfig.discountFactor * maxNextQ;
        targetQ[1] = exp.reward + QLearningConfig.discountFactor * maxNextQ;
      }

      // Calcular pérdida (error cuadrático)
      const loss = Math.pow(targetQ[0] - currentQ[0], 2) +
                   Math.pow(targetQ[1] - currentQ[1], 2);
      totalLoss += loss;

      // Actualizar pesos usando gradiente descendente simplificado
      this.updateWeights(exp.state, currentQ, targetQ);
    }

    this.stepCount++;

    // Actualizar red objetivo periódicamente
    if (this.stepCount % QLearningConfig.targetUpdateFreq === 0) {
      this.targetNetwork = this.cloneNetwork(this.qNetwork);
    }

    const avgLoss = totalLoss / batch.length;
    this.stats.lossHistory.push(avgLoss);

    // Mantener solo últimas 100 pérdidas
    if (this.stats.lossHistory.length > 100) {
      this.stats.lossHistory.shift();
    }

    return avgLoss;
  }

  // Actualización de pesos simplificada (pseudo-gradiente)
  private updateWeights(_state: number[], predicted: number[], target: number[]): void {
    const lr = QLearningConfig.learningRate;

    // Calcular error
    const error = [
      target[0] - predicted[0],
      target[1] - predicted[1]
    ];

    // Actualizar pesos de la última capa basándose en el error
    const lastLevel = this.qNetwork.levels[this.qNetwork.levels.length - 1];

    for (let i = 0; i < lastLevel.inputs.length; i++) {
      for (let j = 0; j < lastLevel.outputs.length; j++) {
        // Gradiente simplificado: δw = lr * error * input
        lastLevel.weights[i][j] += lr * error[j] * lastLevel.inputs[i];
      }
    }

    // Actualizar biases
    for (let j = 0; j < lastLevel.biases.length; j++) {
      lastLevel.biases[j] -= lr * error[j];
    }

    // Propagar hacia atrás (simplificado)
    for (let l = this.qNetwork.levels.length - 2; l >= 0; l--) {
      const level = this.qNetwork.levels[l];
      const avgError = (error[0] + error[1]) / 2;

      for (let i = 0; i < level.inputs.length; i++) {
        for (let j = 0; j < level.outputs.length; j++) {
          level.weights[i][j] += lr * 0.1 * avgError * level.inputs[i];
        }
      }
    }
  }

  // Terminar episodio
  endEpisode(): void {
    this.episodeCount++;

    // Decaer exploración
    this.explorationRate = Math.max(
      QLearningConfig.minExploration,
      this.explorationRate * QLearningConfig.explorationDecay
    );

    // Actualizar estadísticas
    this.stats.explorationRate = this.explorationRate;
    this.stats.episodesCompleted = this.episodeCount;
    this.stats.avgReward = this.totalReward / Math.max(1, this.episodeCount);
    this.stats.maxReward = Math.max(this.stats.maxReward, this.totalReward);

    this.totalReward = 0;
  }

  // Obtener red Q para uso en coches
  getNetwork(): Network {
    return this.qNetwork;
  }

  // Establecer red (para cargar desde localStorage)
  setNetwork(network: Network): void {
    this.qNetwork = network;
    this.targetNetwork = this.cloneNetwork(network);
  }

  // Exportar estado para guardado
  exportState(): string {
    return JSON.stringify({
      qNetwork: this.qNetwork,
      explorationRate: this.explorationRate,
      episodeCount: this.episodeCount,
      stats: this.stats
    });
  }

  // Importar estado guardado
  importState(stateJson: string): void {
    try {
      const state = JSON.parse(stateJson);
      this.qNetwork.levels = state.qNetwork.levels;
      this.targetNetwork = this.cloneNetwork(this.qNetwork);
      this.explorationRate = state.explorationRate || QLearningConfig.explorationRate;
      this.episodeCount = state.episodeCount || 0;
      this.stats = state.stats || this.stats;
    } catch (e) {
      console.error('Error importing DQN state:', e);
    }
  }

  // Resetear agente
  reset(): void {
    this.qNetwork = new Network([7, 12, 2]);
    this.initializeNetworkBalanced(this.qNetwork);
    this.targetNetwork = this.cloneNetwork(this.qNetwork);
    this.replayBuffer.clear();
    this.explorationRate = QLearningConfig.explorationRate;
    this.stepCount = 0;
    this.episodeCount = 0;
    this.totalReward = 0;
    this.stats = {
      avgReward: 0,
      maxReward: 0,
      explorationRate: QLearningConfig.explorationRate,
      episodesCompleted: 0,
      lossHistory: [],
    };
  }
}

// Instancia global del agente DQN
export const dqnAgent = new DQNAgent();
