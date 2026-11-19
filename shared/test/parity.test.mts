// The offline (browser) physics must match the authoritative Python physics.
// Runs the same shots through both and compares final positions and outcomes.
// Run from web/:  npx tsx ../shared/test/parity.test.mts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, Simulation, ShotT } from "../src/physics";

const here = dirname(fileURLToPath(import.meta.url));
const server = resolve(here, "../../server");
const py = resolve(server, ".venv/bin/python");

type Case = { pos: Record<"A" | "B" | "ball", [number, number]>; shots: Record<string, ShotT> };
const cases: Case[] = [];
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 40; i++) {
  cases.push({
    pos: { A: [20 + rnd() * 70, 10 + rnd() * 80], B: [110 + rnd() * 70, 10 + rnd() * 80], ball: [60 + rnd() * 80, 10 + rnd() * 80] },
    shots: { A: [rnd() * 6.28 - 3.14, 1 + Math.floor(rnd() * 3)], B: rnd() < 0.3 ? null : [rnd() * 6.28 - 3.14, 1 + Math.floor(rnd() * 3)] },
  });
}

const script = `
import json, sys
from app.physics import Simulation, describe, positions
out = []
for c in json.load(sys.stdin):
    shots = {k: (tuple(v) if v else None) for k, v in c["shots"].items()}
    s = Simulation({k: tuple(v) for k, v in c["pos"].items()}, shots).run()
    out.append({"pos": positions(s.bodies), "goal": s.events.goal, "steps": s.steps, "kind": describe(s.events, shots)["kind"]})
print(json.dumps(out))
`;
const pyOut = JSON.parse(execFileSync(py, ["-c", script], { cwd: server, input: JSON.stringify(cases) }).toString());

let maxErr = 0;
cases.forEach((c, i) => {
  const s = new Simulation(c.pos, c.shots).run();
  const p = s.positions();
  const ref = pyOut[i];
  assert.equal(s.events.goal, ref.goal, `goal mismatch case ${i}`);
  assert.equal(describe(s.events, c.shots).kind, ref.kind, `outcome mismatch case ${i}`);
  assert.equal(s.steps, ref.steps, `step count mismatch case ${i}`);
  for (const k of ["A", "B", "ball"] as const)
    for (const j of [0, 1]) maxErr = Math.max(maxErr, Math.abs(p[k][j] - ref.pos[k][j]));
});
assert.ok(maxErr < 0.01, `max position difference ${maxErr}`);
console.log(`parity ok: ${cases.length} shots, max position diff ${maxErr.toExponential(2)}`);
