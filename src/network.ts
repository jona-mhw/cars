export class Level {
    inputs: number[];
    outputs: number[];
    biases: number[];
    weights: number[][];

    constructor(inputCount: number, outputCount: number) {
        this.inputs = new Array(inputCount);
        this.outputs = new Array(outputCount);
        this.biases = new Array(outputCount);

        this.weights = [];
        for (let i = 0; i < inputCount; i++) {
            this.weights[i] = new Array(outputCount);
        }

        Level.#randomize(this);
    }

    static #randomize(level: Level) {
        // Inicialización Xavier/Glorot escalada para tanh
        // Mejor que random uniforme: evita saturación inicial de tanh
        const fanIn = level.inputs.length;
        const limit = Math.sqrt(6 / (fanIn + level.outputs.length));
        for (let i = 0; i < level.inputs.length; i++) {
            for (let j = 0; j < level.outputs.length; j++) {
                level.weights[i][j] = (Math.random() * 2 - 1) * limit;
            }
        }
        for (let i = 0; i < level.biases.length; i++) {
            level.biases[i] = (Math.random() * 2 - 1) * 0.1; // biases pequeños al inicio
        }
    }

    // CONTINUOUS outputs using tanh activation
    // Returns values between -1 and 1 for smooth control
    static feedForward(givenInputs: number[], level: Level) {
        for (let i = 0; i < level.inputs.length; i++) {
            level.inputs[i] = givenInputs[i];
        }

        for (let i = 0; i < level.outputs.length; i++) {
            let sum = 0;
            for (let j = 0; j < level.inputs.length; j++) {
                sum += level.inputs[j] * level.weights[j][i];
            }

            // Apply bias and tanh activation for continuous output [-1, 1]
            sum -= level.biases[i];
            level.outputs[i] = Math.tanh(sum);
        }

        return level.outputs;
    }
}

export class Network {
    levels: Level[];

    constructor(neuronCounts: number[]) {
        this.levels = [];
        for (let i = 0; i < neuronCounts.length - 1; i++) {
            this.levels.push(new Level(neuronCounts[i], neuronCounts[i + 1]));
        }
    }

    static feedForward(givenInputs: number[], network: Network) {
        let outputs = Level.feedForward(givenInputs, network.levels[0]);
        for (let i = 1; i < network.levels.length; i++) {
            outputs = Level.feedForward(outputs, network.levels[i]);
        }
        return outputs;
    }

    // ============================================================
    // MUTACIÓN GAUSSIANA ESPARSA
    //   rate  = probabilidad de que un peso/bias específico mute (default 15%)
    //   sigma = magnitud típica del jitter (default 0.3)
    //
    // Antes: lerp(peso, random[-1,1], amount) → ruido brutal y uniforme,
    //        un peso bueno podía ser reemplazado por basura.
    // Ahora: peso += gaussian()*sigma → la mayoría son ajustes pequeños,
    //        ocasionalmente un salto grande (estadística natural).
    //        Solo muta una fracción de pesos (esparsa, no todos).
    // ============================================================
    static mutate(network: Network, rate: number = 0.15, sigma: number = 0.3) {
        network.levels.forEach(level => {
            for (let i = 0; i < level.biases.length; i++) {
                if (Math.random() < rate) {
                    level.biases[i] += gaussian() * sigma;
                    level.biases[i] = clamp(level.biases[i], -1, 1);
                }
            }
            for (let i = 0; i < level.weights.length; i++) {
                for (let j = 0; j < level.weights[i].length; j++) {
                    if (Math.random() < rate) {
                        level.weights[i][j] += gaussian() * sigma;
                        level.weights[i][j] = clamp(level.weights[i][j], -1, 1);
                    }
                }
            }
        });
    }

    // ============================================================
    // CROSSOVER (cruzamiento uniforme)
    // Mezcla genes de dos padres: cada peso/bias del hijo viene 50/50 de A o B.
    // Permite explorar combinaciones que ningún padre tiene por sí solo.
    // ============================================================
    static crossover(parentA: Network, parentB: Network): Network {
        const child = JSON.parse(JSON.stringify(parentA)) as Network;
        // JSON.parse pierde el prototype → restaurarlo para que `mutate` funcione
        Object.setPrototypeOf(child, Network.prototype);
        child.levels.forEach(lvl => Object.setPrototypeOf(lvl, Level.prototype));

        for (let l = 0; l < child.levels.length; l++) {
            const a = parentA.levels[l];
            const b = parentB.levels[l];
            for (let i = 0; i < child.levels[l].biases.length; i++) {
                child.levels[l].biases[i] = Math.random() < 0.5 ? a.biases[i] : b.biases[i];
            }
            for (let i = 0; i < child.levels[l].weights.length; i++) {
                for (let j = 0; j < child.levels[l].weights[i].length; j++) {
                    child.levels[l].weights[i][j] =
                        Math.random() < 0.5 ? a.weights[i][j] : b.weights[i][j];
                }
            }
        }
        return child;
    }
}

// Box-Muller transform: ruido gaussiano N(0, 1)
function gaussian(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
}
