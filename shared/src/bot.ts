// TypeScript port of server/app/bot.py for offline practice. Like the server bot
// it only sees the public board and decides before any human input for the turn.
import { C, Side } from "./protocol";
import { Bodies, DT, ShotT, Simulation } from "./physics";

const L = C.rink.length;
const W = C.rink.width;
const G0 = (W - C.rink.goalWidth) / 2;
const G1 = (W + C.rink.goalWidth) / 2;

export interface PublicBoard {
  positions: Bodies;
  side: Side;
  charges: number;
}

function evaluate(board: PublicBoard, angle: number, power: number): number {
  const me = board.side;
  const opp: Side = me === "A" ? "B" : "A";
  const sim = new Simulation(board.positions, { [me]: [angle, power] }, DT * 2);
  sim.maxSteps = Math.floor(3.5 / sim.h);
  sim.run();
  if (sim.events.goal === me) return 1000 - (power === 3 ? 25 : 0);
  if (sim.events.goal === opp) return -2000;
  const ball = sim.ball;
  const toward = me === "B" ? -1 : 1;
  const attackX = me === "A" ? L : 0;
  const ownX = me === "A" ? 0 : L;
  let score = (ball.x - board.positions.ball[0]) * toward * 1.2;
  const centered = 1 - Math.min(1, Math.abs(ball.y - W / 2) / (W / 2));
  score += Math.max(0, 60 - Math.abs(ball.x - attackX)) * 0.8 * centered;
  score -= Math.max(0, 60 - Math.abs(ball.x - ownX)) * 1.5 * centered;
  const my = sim.bodies[me === "A" ? 0 : 1];
  if ((my.x - ball.x) * toward < 0) score += 12;
  if (my.y > G0 && my.y < G1 && Math.abs(my.x - ownX) < 45) score += 8;
  if (power === 3) score -= 18;
  return score;
}

function gauss(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

export function chooseShot(board: PublicBoard): ShotT {
  const powers = board.charges > 0 ? [1, 2, 3] : [1, 2];
  const results: [number, number, number][] = [];
  const steps = 40;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    for (const p of powers) results.push([evaluate(board, a, p), a, p]);
  }
  results.sort((x, y) => y[0] - x[0]);
  const top = results.slice(0, 5);
  const weights = top.map(([s]) => Math.exp((s - top[0][0]) / 40));
  let r = Math.random() * weights.reduce((x, y) => x + y, 0);
  let pick = top[0];
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      pick = top[i];
      break;
    }
  }
  return [pick[1] + gauss() * ((2.2 * Math.PI) / 180), pick[2]];
}
