// Platform-neutral rink renderer. Web adapts it to Canvas 2D, mobile to React
// Native Skia, so both draw the identical arena from the same code.
import { C, SIDE_COLOR, Shot, Side, Vec } from "./protocol";
import { BOARD, View, toScreen, worldDirToScreen } from "./transform";

export interface Painter {
  clear(color: string): void;
  fillPoly(pts: Vec[], color: string, alpha?: number): void;
  strokePoly(pts: Vec[], color: string, width: number, alpha?: number, closed?: boolean, dash?: number[]): void;
  fillCircle(x: number, y: number, r: number, color: string, alpha?: number): void;
  strokeCircle(x: number, y: number, r: number, color: string, width: number, alpha?: number): void;
  text(s: string, x: number, y: number, size: number, color: string, alpha?: number): void; // centered
}

export const PALETTE = {
  bg: "#070E22",
  rink: "#10204A",
  rinkEdge: "#0C1A3D",
  board: "#E8E2D4",
  marking: "#F4EEE3",
  white: "#FFF7EA",
  ink: "#060B1A",
  pocket: "#050A19",
};

const L = C.rink.length;
const W = C.rink.width;
const GW = C.rink.goalWidth;
const GD = C.rink.goalDepth;
const G0 = (W - GW) / 2;
const G1 = (W + GW) / 2;
const DR = C.bodies.diskRadius;
const BR = C.bodies.ballRadius;
const ARROW = C.shots.arrowLengths;

export interface Arrow {
  side: Side;
  shot: Shot;
  from: Vec; // world position of the disk
  locked: boolean;
  progress?: number; // 0..1 draw-in for the reveal
}

export interface Scene {
  positions: Record<"A" | "B" | "ball", Vec>;
  you: Side | null;
  arrows: Arrow[];
  trail?: { points: Vec[]; alpha: number } | null;
  goalPulse?: { side: Side; t: number } | null; // side that scored; t = 0..1
  lockSnap?: number | null; // 0..1 for the local lock-in snap
  highlightBall?: boolean; // tutorial cue
  timeMs: number;
  reducedMotion?: boolean;
}

function rect(v: View, x0: number, y0: number, x1: number, y1: number): Vec[] {
  return [toScreen(v, [x0, y0]), toScreen(v, [x1, y0]), toScreen(v, [x1, y1]), toScreen(v, [x0, y1])];
}

function arcPts(v: View, cx: number, cy: number, r: number, a0: number, a1: number, n = 24): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(toScreen(v, [cx + Math.cos(a) * r, cy + Math.sin(a) * r]));
  }
  return out;
}

export function drawRink(p: Painter, v: View): void {
  const s = v.scale;
  p.clear(PALETTE.bg);
  // Board backing (slightly bigger than the playing surface)
  p.fillPoly(rect(v, -BOARD, -BOARD, L + BOARD, W + BOARD), PALETTE.board);
  // Goal pockets: dark net with a team tint (defender color)
  for (const side of ["A", "B"] as Side[]) {
    const x0 = side === "A" ? -GD - BOARD * 0.6 : L;
    const x1 = side === "A" ? 0 : L + GD + BOARD * 0.6;
    p.fillPoly(rect(v, x0, G0 - BOARD * 0.6, x1, G1 + BOARD * 0.6), PALETTE.board);
    const n0 = side === "A" ? -GD : L;
    const n1 = side === "A" ? 0 : L + GD;
    p.fillPoly(rect(v, n0, G0, n1, G1), PALETTE.pocket);
    p.fillPoly(rect(v, n0, G0, n1, G1), SIDE_COLOR[side], 0.12);
    // net mesh
    for (let y = G0 + 3.4; y < G1; y += 3.4) {
      p.strokePoly([toScreen(v, [n0, y]), toScreen(v, [n1, y])], PALETTE.marking, Math.max(1, s * 0.25), 0.12);
    }
    for (let x = n0 + 2.75; x < n1; x += 2.75) {
      p.strokePoly([toScreen(v, [x, G0]), toScreen(v, [x, G1])], PALETTE.marking, Math.max(1, s * 0.25), 0.12);
    }
  }
  // Playing surface
  p.fillPoly(rect(v, 0, 0, L, W), PALETTE.rink);
  // Subtle brushed texture along the length
  for (let y = 2; y < W; y += 2.5) {
    const a = 0.018 + ((y * 7.31) % 1) * 0.022;
    p.strokePoly([toScreen(v, [0, y]), toScreen(v, [L, y])], PALETTE.marking, Math.max(0.5, s * 0.2), a);
  }
  // Goal mouths are open: paint the line gap so the opening reads clearly
  for (const gx of [0, L]) {
    p.strokePoly([toScreen(v, [gx, G0]), toScreen(v, [gx, G1])], PALETTE.marking, Math.max(1, s * 0.5), 0.55, false, [s * 1.6, s * 1.2]);
  }
  // Restrained markings
  const mw = Math.max(1, s * 0.45);
  p.strokePoly([toScreen(v, [L / 2, 0]), toScreen(v, [L / 2, W])], PALETTE.marking, mw, 0.16);
  p.strokePoly(arcPts(v, L / 2, W / 2, 15, 0, Math.PI * 2, 48), PALETTE.marking, mw, 0.16, true);
  p.strokePoly(arcPts(v, 0, W / 2, 22, -Math.PI / 2, Math.PI / 2), SIDE_COLOR.A, mw, 0.3);
  p.strokePoly(arcPts(v, L, W / 2, 22, Math.PI / 2, (Math.PI * 3) / 2), SIDE_COLOR.B, mw, 0.3);
  for (const fx of [L * 0.25, L * 0.75]) {
    const [x, y] = toScreen(v, [fx, W / 2]);
    p.fillCircle(x, y, Math.max(1.5, s * 0.9), PALETTE.marking, 0.16);
  }
  // Posts: crisp caps at the goal openings, in the defender's color
  for (const side of ["A", "B"] as Side[]) {
    const gx = side === "A" ? 0 : L;
    for (const gy of [G0, G1]) {
      const [x, y] = toScreen(v, [gx, gy]);
      p.fillCircle(x, y, Math.max(2.5, s * 1.3), SIDE_COLOR[side]);
    }
  }
}

function drawArrow(p: Painter, v: View, a: Arrow): void {
  const s = v.scale;
  const prog = a.progress ?? 1;
  const len = ARROW[a.shot.power] * prog;
  if (len <= 0.5) return;
  const dx = Math.cos(a.shot.angle);
  const dy = Math.sin(a.shot.angle);
  const start: Vec = [a.from[0] + dx * (DR + 1.2), a.from[1] + dy * (DR + 1.2)];
  const tip: Vec = [start[0] + dx * len, start[1] + dy * len];
  const color = SIDE_COLOR[a.side];
  const ss = toScreen(v, start);
  const st = toScreen(v, tip);
  const [sdx, sdy] = worldDirToScreen(v, dx, dy);
  const nx = -sdy;
  const ny = sdx;
  const head = Math.max(7, s * 3.2);
  const width = Math.max(2.5, s * 1.1);
  const shaftEnd: Vec = [st[0] - sdx * head * 0.8, st[1] - sdy * head * 0.8];
  // dark under-stroke keeps the arrow readable over any marking
  p.strokePoly([ss, shaftEnd], PALETTE.ink, width + 3, 0.6);
  p.strokePoly([ss, shaftEnd], color, width, a.locked ? 1 : 0.9, false, a.locked ? undefined : [width * 2.4, width * 1.4]);
  const headPts: Vec[] = [
    st,
    [st[0] - sdx * head + nx * head * 0.62, st[1] - sdy * head + ny * head * 0.62],
    [st[0] - sdx * head - nx * head * 0.62, st[1] - sdy * head - ny * head * 0.62],
  ];
  p.strokePoly(headPts, PALETTE.ink, 3, 0.6, true);
  p.fillPoly(headPts, color);
  // Power chevrons along the shaft: shape-coded strength, not color-only
  if (prog >= 1) {
    for (let i = 0; i < a.shot.power; i++) {
      const back = head * 1.25 + i * head * 0.55;
      const cx = st[0] - sdx * back;
      const cy = st[1] - sdy * back;
      const w2 = head * 0.42;
      p.strokePoly(
        [
          [cx - sdx * w2 + nx * w2, cy - sdy * w2 + ny * w2],
          [cx, cy],
          [cx - sdx * w2 - nx * w2, cy - sdy * w2 - ny * w2],
        ],
        PALETTE.ink,
        Math.max(1.5, s * 0.5),
        0.85,
      );
    }
  }
}

function drawDisk(p: Painter, v: View, side: Side, pos: Vec, isYou: boolean, snap: number | null): void {
  const s = v.scale;
  const [x, y] = toScreen(v, pos);
  const pulse = snap != null ? 1 + 0.22 * (1 - snap) : 1;
  const r = DR * s * pulse;
  const color = SIDE_COLOR[side];
  p.fillCircle(x, y + s * 0.8, r, "#000000", 0.35); // contact shadow
  p.fillCircle(x, y, r, color);
  p.fillCircle(x, y, r * 0.64, PALETTE.ink);
  // Shape marking: A = triangle, B = square (screen-aligned so it never reads as an arrow)
  const m = r * 0.36;
  if (side === "A") {
    p.fillPoly(
      [
        [x, y - m * 1.1],
        [x + m, y + m * 0.75],
        [x - m, y + m * 0.75],
      ],
      color,
    );
  } else {
    p.fillPoly(
      [
        [x - m * 0.8, y - m * 0.8],
        [x + m * 0.8, y - m * 0.8],
        [x + m * 0.8, y + m * 0.8],
        [x - m * 0.8, y + m * 0.8],
      ],
      color,
    );
  }
  if (isYou) {
    p.strokeCircle(x, y, r + Math.max(2, s * 0.9), PALETTE.white, Math.max(1.5, s * 0.45), 0.95);
    // Tag sits below the disk (toward your own goal on phones),
    // away from where forward shots and their arrows usually go.
    const size = Math.max(10, s * 3.4);
    const off = r + Math.max(9, s * 4.2);
    const label = y + off + size < v.height ? y + off : y - off;
    p.fillPoly(
      [
        [x - size * 1.25, label - size * 0.62],
        [x + size * 1.25, label - size * 0.62],
        [x + size * 1.25, label + size * 0.62],
        [x - size * 1.25, label + size * 0.62],
      ],
      PALETTE.ink,
      0.8,
    );
    p.text("YOU", x, label, size, PALETTE.white);
  }
}

function drawBall(p: Painter, v: View, pos: Vec, highlight: boolean, timeMs: number, reduced: boolean): void {
  const s = v.scale;
  const [x, y] = toScreen(v, pos);
  const r = BR * s;
  if (highlight) {
    const k = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(timeMs / 260);
    p.strokeCircle(x, y, r * (1.9 + k * 0.4), PALETTE.white, Math.max(1.5, s * 0.4), 0.35 + 0.3 * k);
  }
  p.fillCircle(x, y, r + Math.max(1.5, s * 0.7), PALETTE.ink, 0.9);
  p.fillCircle(x, y, r, PALETTE.white);
  // Seam: a dark four-point star makes the ball's silhouette unique at phone size
  const q = r * 0.62;
  const t = r * 0.16;
  p.fillPoly(
    [
      [x, y - q],
      [x + t, y - t],
      [x + q, y],
      [x + t, y + t],
      [x, y + q],
      [x - t, y + t],
      [x - q, y],
      [x - t, y - t],
    ],
    PALETTE.ink,
  );
}

export function drawScene(p: Painter, v: View, sc: Scene): void {
  drawRink(p, v);
  if (sc.goalPulse) {
    const scored = sc.goalPulse.side;
    const conceded = scored === "A" ? "B" : "A";
    const n0 = conceded === "A" ? -GD : L;
    const n1 = conceded === "A" ? 0 : L + GD;
    const k = 1 - sc.goalPulse.t;
    p.fillPoly(rect(v, n0, G0, n1, G1), SIDE_COLOR[scored], 0.25 + 0.55 * k);
    if (!sc.reducedMotion) {
      const [cx, cy] = toScreen(v, [conceded === "A" ? 0 : L, W / 2]);
      p.strokeCircle(cx, cy, (12 + 30 * sc.goalPulse.t) * v.scale, SIDE_COLOR[scored], Math.max(2, v.scale), 0.7 * k);
    }
  }
  if (sc.trail && sc.trail.points.length > 1) {
    const pts = sc.trail.points.map((q) => toScreen(v, q));
    p.strokePoly(pts, PALETTE.ink, Math.max(3, v.scale * 1.4), 0.4 * sc.trail.alpha);
    p.strokePoly(pts, PALETTE.white, Math.max(1.5, v.scale * 0.6), 0.75 * sc.trail.alpha, false, [v.scale * 2, v.scale * 1.4]);
  }
  for (const side of ["A", "B"] as Side[]) {
    drawDisk(p, v, side, sc.positions[side], sc.you === side, sc.you === side ? (sc.lockSnap ?? null) : null);
  }
  drawBall(p, v, sc.positions.ball, !!sc.highlightBall, sc.timeMs, !!sc.reducedMotion);
  for (const a of sc.arrows) drawArrow(p, v, a);
}
