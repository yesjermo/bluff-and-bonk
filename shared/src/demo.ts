import { C, Vec } from "./protocol";
import type { Scene } from "./render";

// A scripted bank shot for the entry screen: A drives the ball off the near
// board and into B's goal. Purely illustrative (the real game is server-run).
const L = C.rink.length;
const ballStart: Vec = [104, 64];
const bounce: Vec = [146, C.rink.width - C.bodies.ballRadius];
const goal: Vec = [L + 8, 50];
const dir = norm([bounce[0] - ballStart[0], bounce[1] - ballStart[1]]);
const diskStart: Vec = [ballStart[0] - dir[0] * 30, ballStart[1] - dir[1] * 30];
const contact: Vec = [ballStart[0] - dir[0] * (C.bodies.ballRadius + C.bodies.diskRadius), ballStart[1] - dir[1] * (C.bodies.ballRadius + C.bodies.diskRadius)];
const diskEnd: Vec = [contact[0] + dir[0] * 14, contact[1] + dir[1] * 14];
const B: Vec = [168, 24];
const LOOP = 4600;

function norm(v: Vec): Vec {
  const n = Math.hypot(v[0], v[1]);
  return [v[0] / n, v[1] / n];
}
const lerp = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const clamp = (t: number) => Math.max(0, Math.min(1, t));

export function demoScene(timeMs: number, reduced: boolean): Scene {
  const t = reduced ? 3000 : timeMs % LOOP;
  let disk = diskStart;
  let ball = ballStart;
  const angle = Math.atan2(dir[1], dir[0]);
  const arrows: Scene["arrows"] = [];
  let trail: Scene["trail"] = null;
  let goalPulse: Scene["goalPulse"] = null;
  const path: Vec[] = [ballStart, bounce, goal];

  if (t < 900) {
    arrows.push({ side: "A", shot: { angle, power: 2 }, from: diskStart, locked: t > 500, progress: clamp(t / 200) });
  } else if (t < 1150) {
    disk = lerp(diskStart, contact, (t - 900) / 250);
  } else {
    const k = clamp((t - 1150) / 1300);
    disk = lerp(contact, diskEnd, easeOut(clamp((t - 1150) / 700)));
    const e = easeOut(k);
    ball = e < 0.42 ? lerp(ballStart, bounce, e / 0.42) : lerp(bounce, goal, (e - 0.42) / 0.58);
    if (t > 2450) {
      trail = { points: path, alpha: t > 4000 ? clamp(1 - (t - 4000) / 500) : 1 };
      if (t < 3300) goalPulse = { side: "A", t: (t - 2450) / 850 };
    }
  }
  if (reduced) trail = { points: path, alpha: 1 };
  return { positions: { A: disk, B, ball }, you: null, arrows, trail, goalPulse, timeMs, reducedMotion: reduced };
}
