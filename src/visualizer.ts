import { Network, Level } from "./network";

// Colores de la paleta slate
const colors = {
    bgNode: "#252b3b",
    positive: "#4ade80",   // accent-success
    negative: "#38bdf8",   // accent-primary
    neutral: "#94a3b8",    // text-muted
    text: "#f8fafc"        // text-primary
};

export class Visualizer {
    static drawNetwork(ctx: CanvasRenderingContext2D, network: Network) {
        const margin = 30;
        const left = margin;
        const top = margin;
        const width = ctx.canvas.width - margin * 2;
        const height = ctx.canvas.height - margin * 2;

        const levelHeight = height / network.levels.length;

        for (let i = network.levels.length - 1; i >= 0; i--) {
            const levelTop = top +
                lerp(
                    height - levelHeight,
                    0,
                    network.levels.length == 1
                        ? 0.5
                        : i / (network.levels.length - 1)
                );

            ctx.setLineDash([5, 3]);
            Visualizer.drawLevel(ctx, network.levels[i],
                left, levelTop,
                width, levelHeight,
                i == network.levels.length - 1
                    ? ['\u2191', '\u2190', '\u2192', '\u2193']
                    : []
            );
        }
    }

    static drawLevel(ctx: CanvasRenderingContext2D, level: Level, left: number, top: number, width: number, height: number, outputLabels: string[]) {
        const right = left + width;
        const bottom = top + height;

        const { inputs, outputs, weights, biases } = level;

        // Conexiones
        for (let i = 0; i < inputs.length; i++) {
            for (let j = 0; j < outputs.length; j++) {
                ctx.beginPath();
                ctx.moveTo(Visualizer.#getNodeX(inputs, i, left, right), bottom);
                ctx.lineTo(Visualizer.#getNodeX(outputs, j, left, right), top);
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = getConnectionColor(weights[i][j]);
                ctx.stroke();
            }
        }

        const nodeRadius = 12;

        // Nodos de entrada
        for (let i = 0; i < inputs.length; i++) {
            const x = Visualizer.#getNodeX(inputs, i, left, right);
            ctx.beginPath();
            ctx.arc(x, bottom, nodeRadius, 0, Math.PI * 2);
            ctx.fillStyle = colors.bgNode;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, bottom, nodeRadius * 0.65, 0, Math.PI * 2);
            ctx.fillStyle = getNodeColor(inputs[i]);
            ctx.fill();
        }

        // Nodos de salida
        for (let i = 0; i < outputs.length; i++) {
            const x = Visualizer.#getNodeX(outputs, i, left, right);
            ctx.beginPath();
            ctx.arc(x, top, nodeRadius, 0, Math.PI * 2);
            ctx.fillStyle = colors.bgNode;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, top, nodeRadius * 0.65, 0, Math.PI * 2);
            ctx.fillStyle = getNodeColor(outputs[i]);
            ctx.fill();

            // Bias ring
            ctx.beginPath();
            ctx.lineWidth = 1.5;
            ctx.arc(x, top, nodeRadius * 0.85, 0, Math.PI * 2);
            ctx.strokeStyle = getBiasColor(biases[i]);
            ctx.setLineDash([2, 2]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Labels
            if (outputLabels[i]) {
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = colors.text;
                ctx.font = "bold 11px Inter, Arial";
                ctx.fillText(outputLabels[i], x, top);
            }
        }
    }

    static #getNodeX(nodes: any[], index: number, left: number, right: number) {
        return lerp(
            left,
            right,
            nodes.length == 1
                ? 0.5
                : index / (nodes.length - 1)
        );
    }
}

function lerp(A: number, B: number, t: number) {
    return A + (B - A) * t;
}

function getConnectionColor(value: number) {
    const alpha = Math.min(Math.abs(value) * 0.8, 0.8);
    if (value > 0) {
        return `rgba(74, 222, 128, ${alpha})`; // verde
    } else {
        return `rgba(56, 189, 248, ${alpha})`; // azul
    }
}

function getNodeColor(value: number) {
    const intensity = Math.abs(value);
    if (intensity < 0.1) {
        return colors.bgNode;
    }
    if (value > 0) {
        return `rgba(74, 222, 128, ${Math.min(intensity, 1)})`;
    } else {
        return `rgba(56, 189, 248, ${Math.min(intensity, 1)})`;
    }
}

function getBiasColor(value: number) {
    const alpha = Math.min(Math.abs(value) * 0.6, 0.6);
    if (value > 0) {
        return `rgba(251, 191, 36, ${alpha})`; // amarillo
    } else {
        return `rgba(248, 113, 113, ${alpha})`; // rojo
    }
}
