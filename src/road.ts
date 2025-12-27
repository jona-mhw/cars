export class Road {
    x: number;
    width: number;
    laneCount: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    borders: { x: number; y: number }[][];

    // Colores de la paleta slate
    private readonly colors = {
        asphalt: "#2d3548",
        asphaltLight: "#3a4459",
        laneLine: "rgba(148, 163, 184, 0.4)",
        borderLine: "rgba(148, 163, 184, 0.7)",
        borderGlow: "rgba(56, 189, 248, 0.15)"
    };

    constructor(x: number, width: number, laneCount: number = 3) {
        this.x = x;
        this.width = width;
        this.laneCount = laneCount;

        this.left = x - width / 2;
        this.right = x + width / 2;

        const infinity = 1000000;
        this.top = -infinity;
        this.bottom = infinity;

        const topLeft = { x: this.left, y: this.top };
        const topRight = { x: this.right, y: this.top };
        const bottomLeft = { x: this.left, y: this.bottom };
        const bottomRight = { x: this.right, y: this.bottom };
        this.borders = [
            [topLeft, bottomLeft],
            [topRight, bottomRight]
        ];
    }

    getLaneCenter(laneIndex: number) {
        const laneWidth = this.width / this.laneCount;
        return this.left + laneWidth / 2 + Math.min(laneIndex, this.laneCount - 1) * laneWidth;
    }

    draw(ctx: CanvasRenderingContext2D) {
        // Fondo de asfalto - color solido (sin gradiente)
        ctx.fillStyle = this.colors.asphaltLight;
        ctx.fillRect(this.left, this.top, this.width, this.bottom - this.top);

        // Lineas de carril (punteadas)
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.colors.laneLine;
        ctx.setLineDash([20, 30]);

        for (let i = 1; i <= this.laneCount - 1; i++) {
            const x = lerp(this.left, this.right, i / this.laneCount);
            ctx.beginPath();
            ctx.moveTo(x, this.top);
            ctx.lineTo(x, this.bottom);
            ctx.stroke();
        }

        // Bordes laterales
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.colors.borderLine;
        this.borders.forEach(border => {
            ctx.beginPath();
            ctx.moveTo(border[0].x, border[0].y);
            ctx.lineTo(border[1].x, border[1].y);
            ctx.stroke();
        });
    }
}

function lerp(A: number, B: number, t: number) {
    return A + (B - A) * t;
}
