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

    draw(ctx: CanvasRenderingContext2D, cameraY: number = 0) {
        // Fondo de asfalto - color solido (sin gradiente)
        ctx.fillStyle = this.colors.asphaltLight;
        ctx.fillRect(this.left, this.top, this.width, this.bottom - this.top);

        // Dibujar marcadores de zona cada 500 unidades
        this.drawZoneMarkers(ctx, cameraY);

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

    // Marcadores de zona con colores progresivos
    private drawZoneMarkers(ctx: CanvasRenderingContext2D, cameraY: number) {
        const ZONE_SIZE = 500; // Cada 500 metros
        const canvasHeight = ctx.canvas.height;

        // Calcular qué zonas son visibles
        const startY = cameraY - canvasHeight;
        const endY = cameraY + canvasHeight;

        const startZone = Math.floor((-startY) / ZONE_SIZE);
        const endZone = Math.floor((-endY) / ZONE_SIZE);

        // Colores de zona (del verde al púrpura, representando progreso)
        const zoneColors = [
            { threshold: 0, color: "rgba(74, 222, 128, 0.15)", borderColor: "#4ade80" },    // Verde - inicio
            { threshold: 1000, color: "rgba(34, 211, 238, 0.15)", borderColor: "#22d3ee" },  // Cyan
            { threshold: 2000, color: "rgba(56, 189, 248, 0.15)", borderColor: "#38bdf8" },  // Azul
            { threshold: 3000, color: "rgba(139, 92, 246, 0.15)", borderColor: "#8b5cf6" },  // Violeta
            { threshold: 5000, color: "rgba(236, 72, 153, 0.15)", borderColor: "#ec4899" },  // Rosa
            { threshold: 8000, color: "rgba(239, 68, 68, 0.12)", borderColor: "#ef4444" },   // Rojo
            { threshold: 12000, color: "rgba(251, 191, 36, 0.12)", borderColor: "#fbbf24" }, // Dorado
        ];

        for (let zone = endZone; zone <= startZone + 1; zone++) {
            const zoneY = -zone * ZONE_SIZE;
            const distance = zone * ZONE_SIZE;

            // Obtener color de zona
            let zoneStyle = zoneColors[0];
            for (const style of zoneColors) {
                if (distance >= style.threshold) {
                    zoneStyle = style;
                }
            }

            // Línea de marcador de zona (cada 500m)
            if (zone > 0) {
                ctx.beginPath();
                ctx.strokeStyle = zoneStyle.borderColor;
                ctx.lineWidth = 2;
                ctx.setLineDash([10, 5]);
                ctx.moveTo(this.left, zoneY);
                ctx.lineTo(this.right, zoneY);
                ctx.stroke();
                ctx.setLineDash([]);

                // Etiqueta de distancia
                ctx.font = "bold 12px Inter, Arial";
                ctx.fillStyle = zoneStyle.borderColor;
                ctx.textAlign = "left";
                ctx.fillText(`${distance}m`, this.left + 5, zoneY - 5);
            }
        }
    }
}

function lerp(A: number, B: number, t: number) {
    return A + (B - A) * t;
}
