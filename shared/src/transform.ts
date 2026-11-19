// World <-> screen transforms. Only rotations are used (never mirrors), so a
// bank off a given board is the same physical board for every viewer.
//
// World: x along the rink length (0 = A's goal line, L = B's goal line), y across.
// "h" = horizontal (desktop): own goal on the LEFT.  "v" = vertical (phone): own goal at the BOTTOM.
import { C, Side, Vec } from "./protocol";

export type Orientation = "h" | "v";

const L = C.rink.length;
const W = C.rink.width;
const GD = C.rink.goalDepth;
export const BOARD = 3.5; // drawn board thickness in world units
const PAD = GD + BOARD + 1;

export interface View {
  orient: Orientation;
  side: Side; // whose perspective (spectators use "A")
  scale: number; // px per world unit
  ox: number;
  oy: number;
  width: number; // px of canvas
  height: number;
}

/** Size of the drawn arena in world units for an orientation. */
export function arenaExtent(orient: Orientation): { w: number; h: number } {
  const long = L + 2 * PAD;
  const short = W + 2 * (BOARD + 1);
  return orient === "h" ? { w: long, h: short } : { w: short, h: long };
}

/** Aspect ratio (width / height) the rink wants. */
export function arenaAspect(orient: Orientation): number {
  const e = arenaExtent(orient);
  return e.w / e.h;
}

export function makeView(orient: Orientation, side: Side, width: number, height: number): View {
  const e = arenaExtent(orient);
  const scale = Math.min(width / e.w, height / e.h);
  // Center the rink. In view-space the rink interior spans rotated world coords.
  const vw = orient === "h" ? L : W;
  const vh = orient === "h" ? W : L;
  const ox = (width - vw * scale) / 2;
  const oy = (height - vh * scale) / 2;
  return { orient, side, scale, ox, oy, width, height };
}

/** Rotate a world point into un-scaled view space. */
function rot(v: View, x: number, y: number): Vec {
  if (v.orient === "h") return v.side === "A" ? [x, y] : [L - x, W - y];
  return v.side === "A" ? [y, L - x] : [W - y, x];
}

export function toScreen(v: View, p: Vec | readonly number[]): Vec {
  const [rx, ry] = rot(v, p[0], p[1]);
  return [v.ox + rx * v.scale, v.oy + ry * v.scale];
}

/** Screen-space direction -> world-space direction (unit-agnostic). */
export function screenDirToWorld(v: View, dx: number, dy: number): Vec {
  if (v.orient === "h") return v.side === "A" ? [dx, dy] : [-dx, -dy];
  return v.side === "A" ? [-dy, dx] : [dy, -dx];
}

export function worldDirToScreen(v: View, dx: number, dy: number): Vec {
  if (v.orient === "h") return v.side === "A" ? [dx, dy] : [-dx, -dy];
  return v.side === "A" ? [dy, -dx] : [-dy, dx];
}

export function screenToWorld(v: View, sx: number, sy: number): Vec {
  const rx = (sx - v.ox) / v.scale;
  const ry = (sy - v.oy) / v.scale;
  if (v.orient === "h") return v.side === "A" ? [rx, ry] : [L - rx, W - ry];
  return v.side === "A" ? [L - ry, rx] : [ry, W - rx];
}

/** Angle in world space from a screen drag vector. */
export function dragToWorldAngle(v: View, dx: number, dy: number): number {
  const [wx, wy] = screenDirToWorld(v, dx, dy);
  return Math.atan2(wy, wx);
}

/** Rotate a world angle by a keyboard step, clockwise on screen for positive steps. */
export function rotateAngleOnScreen(v: View, angle: number, stepRad: number): number {
  const [sx, sy] = worldDirToScreen(v, Math.cos(angle), Math.sin(angle));
  const a = Math.atan2(sy, sx) + stepRad;
  return dragToWorldAngle(v, Math.cos(a), Math.sin(a));
}

/** Angle that points the local player straight at the opponent's goal on screen. */
export function forwardAngle(side: Side): number {
  return side === "A" ? 0 : Math.PI;
}
