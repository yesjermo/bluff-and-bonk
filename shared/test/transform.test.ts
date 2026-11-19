// Cross-view consistency: every view is a pure rotation of the same arena, so an
// aim drawn toward a screen point lands on the same world point for every viewer,
// and both players see their own goal at the bottom (phone) / left (desktop).
import assert from "node:assert/strict";
import { C } from "../src/protocol";
import { dragToWorldAngle, makeView, screenToWorld, toScreen, worldDirToScreen } from "../src/transform";

const L = C.rink.length, W = C.rink.width;
const views = (["h", "v"] as const).flatMap((o) => (["A", "B"] as const).map((s) => makeView(o, s, o === "h" ? 1200 : 400, o === "h" ? 600 : 840)));
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

for (const v of views) {
  // round trip
  for (const p of [[0, 0], [L, W], [37, 81], [L / 2, W / 2]] as [number, number][]) {
    const [sx, sy] = toScreen(v, p);
    const [x, y] = screenToWorld(v, sx, sy);
    assert.ok(near(x, p[0]) && near(y, p[1]), `round trip ${v.orient}${v.side}`);
  }
  // own goal bottom (v) / left (h)
  const own = toScreen(v, [v.side === "A" ? 0 : L, W / 2]);
  const opp = toScreen(v, [v.side === "A" ? L : 0, W / 2]);
  if (v.orient === "v") assert.ok(own[1] > opp[1], "own goal at bottom");
  else assert.ok(own[0] < opp[0], "own goal on left");
  // dragging "up" (v) or "right" (h) aims at the opponent's goal
  const a = v.orient === "v" ? dragToWorldAngle(v, 0, -50) : dragToWorldAngle(v, 50, 0);
  assert.ok(near(Math.cos(a), v.side === "A" ? 1 : -1), "forward drag aims at opponent goal");
  // pure rotation: determinant +1 (no mirroring, so banks hit the same board)
  const [ax, ay] = worldDirToScreen(v, 1, 0);
  const [bx, by] = worldDirToScreen(v, 0, 1);
  assert.ok(near(ax * by - ay * bx, 1), "rotation, not reflection");
}
// The top board (y = 0) is the same physical board for both phones: A sees it on
// the left, B on the right — consistent with facing opposite directions.
const vA = views[2], vB = views[3];
assert.ok(toScreen(vA, [L / 2, 0])[0] < vA.width / 2 && toScreen(vB, [L / 2, 0])[0] > vB.width / 2);
console.log("transform tests passed:", views.length, "views");
