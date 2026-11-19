// TypeScript port of server/app/physics.py, used only for offline practice in
// the browser (e.g. the GitHub Pages build). Multiplayer always uses the
// server's simulation. Keep the two in step; shared/test/parity.test.mts
// compares them on the same shots.
import { C, Side, Vec } from "./protocol";

const L = C.rink.length;
const W = C.rink.width;
const GW = C.rink.goalWidth;
const GD = C.rink.goalDepth;
const G0 = (W - GW) / 2;
const G1 = (W + GW) / 2;
const P = C.physics;
export const DT = P.dt;
const SUB = P.substeps;
const SPEEDS = C.shots.speeds;

type Seg = [number, number, number, number];
const WALLS: Seg[] = [
  [0, 0, L, 0],
  [0, W, L, W],
  [0, 0, 0, G0],
  [0, G1, 0, W],
  [0, G0, -GD, G0],
  [0, G1, -GD, G1],
  [-GD, G0, -GD, G1],
  [L, 0, L, G0],
  [L, G1, L, W],
  [L, G0, L + GD, G0],
  [L, G1, L + GD, G1],
  [L + GD, G0, L + GD, G1],
];
// Disks can't enter the nets; only the ball crosses the goal lines.
const DISK_WALLS: Seg[] = [...WALLS, [0, G0, 0, G1], [L, G0, L, G1]];

export type Kind = "A" | "B" | "ball";
export type ShotT = [number, number] | null; // [angle, power]
export type Bodies = Record<Kind, Vec>;

interface Body {
  kind: Kind;
  x: number;
  y: number;
  r: number;
  m: number;
  friction: number;
  restWall: number;
  vx: number;
  vy: number;
}

export class SimEvents {
  contacts: [string, string][] = [];
  goal: Side | null = null;
  add(kind: string, detail: string) {
    const last = this.contacts[this.contacts.length - 1];
    if (!last || last[0] !== kind || last[1] !== detail) this.contacts.push([kind, detail]);
  }
}

function makeBodies(pos: Bodies): Body[] {
  const b = C.bodies;
  const mk = (kind: Kind, p: Vec, r: number, m: number, f: number, rw: number): Body => ({
    kind, x: p[0], y: p[1], r, m, friction: f, restWall: rw, vx: 0, vy: 0,
  });
  return [
    mk("A", pos.A, b.diskRadius, b.diskMass, P.diskFriction, P.wallRestitution),
    mk("B", pos.B, b.diskRadius, b.diskMass, P.diskFriction, P.wallRestitution),
    mk("ball", pos.ball, b.ballRadius, b.ballMass, P.ballFriction, P.ballWallRestitution),
  ];
}

const speed = (b: Body) => Math.hypot(b.vx, b.vy);

function collideWall(b: Body, s: Seg, ev: SimEvents) {
  const [x1, y1, x2, y2] = s;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t = ((b.x - x1) * dx + (b.y - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  const ox = b.x - cx;
  const oy = b.y - cy;
  const d = Math.hypot(ox, oy);
  if (d >= b.r || d === 0) return;
  const nx = ox / d;
  const ny = oy / d;
  b.x += nx * (b.r - d);
  b.y += ny * (b.r - d);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + b.restWall) * vn * nx;
    b.vy -= (1 + b.restWall) * vn * ny;
    if (b.kind === "ball" && -vn > 8) ev.add("wall", "");
  }
}

function collideBodies(a: Body, b: Body, ev: SimEvents) {
  const ox = b.x - a.x;
  const oy = b.y - a.y;
  const d = Math.hypot(ox, oy);
  const minD = a.r + b.r;
  if (d >= minD || d === 0) return;
  const nx = ox / d;
  const ny = oy / d;
  const overlap = minD - d;
  const ia = 1 / a.m;
  const ib = 1 / b.m;
  const total = ia + ib;
  a.x -= (nx * overlap * ia) / total;
  a.y -= (ny * overlap * ia) / total;
  b.x += (nx * overlap * ib) / total;
  b.y += (ny * overlap * ib) / total;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = (-(1 + P.bodyRestitution) * rv) / total;
    a.vx -= j * nx * ia;
    a.vy -= j * ny * ia;
    b.vx += j * nx * ib;
    b.vy += j * ny * ib;
    if (-rv > 4) {
      if (a.kind === "ball" || b.kind === "ball") ev.add("touch", b.kind === "ball" ? a.kind : b.kind);
      else ev.add("disks", "");
    }
  }
}

function step(bodies: Body[], ev: SimEvents, h: number) {
  const sh = h / SUB;
  for (let s = 0; s < SUB; s++) {
    for (const b of bodies) {
      const sp = speed(b);
      if (sp > 0) {
        const dec = (b.friction + P.linearDrag * sp) * sh;
        const k = Math.max(0, sp - dec) / sp;
        b.vx *= k;
        b.vy *= k;
      }
      b.x += b.vx * sh;
      b.y += b.vy * sh;
    }
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) collideBodies(bodies[i], bodies[j], ev);
    for (const b of bodies) for (const seg of b.kind === "ball" ? WALLS : DISK_WALLS) collideWall(b, seg, ev);
  }
}

function checkGoal(ball: Body): Side | null {
  if (ball.x < -ball.r && ball.y > G0 && ball.y < G1) return "B";
  if (ball.x > L + ball.r && ball.y > G0 && ball.y < G1) return "A";
  return null;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;

export class Simulation {
  bodies: Body[];
  events = new SimEvents();
  steps = 0;
  maxSteps: number;
  done = false;
  ballPath: Vec[];

  constructor(pos: Bodies, shots: Partial<Record<Side, ShotT>>, public h = DT) {
    this.bodies = makeBodies(pos);
    for (const b of this.bodies) {
      const s = shots[b.kind as Side];
      if (s) {
        const v = SPEEDS[s[1]];
        b.vx = Math.cos(s[0]) * v;
        b.vy = Math.sin(s[0]) * v;
      }
    }
    this.maxSteps = Math.floor(P.maxSimSeconds / h);
    this.ballPath = [[r2(this.ball.x), r2(this.ball.y)]];
  }

  get ball(): Body {
    return this.bodies[2];
  }

  advance(n = 1) {
    for (let i = 0; i < n && !this.done; i++) {
      step(this.bodies, this.events, this.h);
      this.steps++;
      if (this.steps % 4 === 0) this.ballPath.push([r2(this.ball.x), r2(this.ball.y)]);
      const g = checkGoal(this.ball);
      if (g) {
        this.events.goal = g;
        this.done = true;
      } else if (this.bodies.every((b) => speed(b) < P.stopSpeed) || this.steps >= this.maxSteps) {
        for (const b of this.bodies) b.vx = b.vy = 0;
        this.done = true;
      }
    }
    if (this.done) this.ballPath.push([r2(this.ball.x), r2(this.ball.y)]);
  }

  run(): this {
    while (!this.done) this.advance(64);
    return this;
  }

  positions(): Bodies {
    const p = (b: Body): Vec => [r3(b.x), r3(b.y)];
    return { A: p(this.bodies[0]), B: p(this.bodies[1]), ball: p(this.bodies[2]) };
  }
}

export function describe(ev: SimEvents, shots: Partial<Record<Side, ShotT>>): { kind: string; scorer?: Side; by?: Side } {
  const c = ev.contacts;
  const touches = c.filter(([k]) => k === "touch").map(([, d]) => d as Side);
  const other = (s: Side): Side => (s === "A" ? "B" : "A");
  if (ev.goal) {
    const scorer = ev.goal;
    let last = -1;
    c.forEach(([k], i) => k === "touch" && (last = i));
    const lastToucher = last >= 0 ? (c[last][1] as Side) : null;
    const banked = c.slice(last + 1).some(([k]) => k === "wall");
    const kind = lastToucher === other(scorer) ? "own_goal" : banked ? "bank" : "direct";
    return { kind, scorer };
  }
  if (!Object.values(shots).some(Boolean)) return { kind: "still" };
  if (!touches.length) return { kind: c.some(([k]) => k === "disks") ? "disks" : "miss" };
  const distinct: Side[] = [];
  for (const t of touches) if (distinct[distinct.length - 1] !== t) distinct.push(t);
  if (distinct.length >= 2) return { kind: "block", by: other(distinct[0]) };
  const first = c.find(([k]) => k === "disks" || k === "touch");
  if (first && first[0] === "disks") return { kind: "block", by: other(touches[0]) };
  if (c.some(([k]) => k === "wall")) return { kind: "bank_miss", by: touches[0] };
  return { kind: "miss", by: touches[0] };
}
