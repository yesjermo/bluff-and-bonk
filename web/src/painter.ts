import type { Painter } from "@shared/render";
import type { Vec } from "@shared/protocol";

export function canvasPainter(ctx: CanvasRenderingContext2D, w: number, h: number): Painter {
  const path = (pts: Vec[], closed: boolean) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (closed) ctx.closePath();
  };
  return {
    clear(color) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
    },
    fillPoly(pts, color, alpha = 1) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      path(pts, true);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    strokePoly(pts, color, width, alpha = 1, closed = false, dash) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(dash ?? []);
      path(pts, closed);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    },
    fillCircle(x, y, r, color, alpha = 1) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    strokeCircle(x, y, r, color, width, alpha = 1) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    text(s, x, y, size, color, alpha = 1) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s, x, y + size * 0.04);
      ctx.globalAlpha = 1;
    },
  };
}
