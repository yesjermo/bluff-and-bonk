// Drives two real GameClients (the same code the web and mobile apps use) against a
// running server: player A uses the desktop (horizontal) view, player B the phone
// (vertical) view. Checks that screen-space aims map to the same world direction,
// both clients agree on score/positions, and a match + rematch completes.
// Run: server on :8000, then `npx tsx shared/test/crossplay.test.ts`.
import assert from "node:assert/strict";
import { GameClient, KeyValueStore } from "../src/client";
import { dragToWorldAngle, makeView, toScreen } from "../src/transform";

const URL = process.env.WS_URL || "ws://127.0.0.1:8000/ws";
const mem = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};
const wait = (pred: () => boolean, ms = 15000) =>
  new Promise<void>((res, rej) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (pred()) (clearInterval(id), res());
      else if (Date.now() - t0 > ms) (clearInterval(id), rej(new Error("timeout")));
    }, 20);
  });

const desk = new GameClient(URL, mem());
const phone = new GameClient(URL, mem());
desk.create();
await wait(() => !!desk.state?.room);
await phone.join(desk.state!.room);
await wait(() => !!phone.state?.you);
desk.ready(); // the lobby screen sends this on both platforms
phone.ready();
await wait(() => desk.phase === "planning" && phone.phase === "planning");
assert.equal(desk.side, "A");
assert.equal(phone.side, "B");

const deskView = makeView("h", "A", 1200, 600);
const phoneView = makeView("v", "B", 390, 700);

// Phone player drags straight UP the screen = toward the opponent's goal at the top.
const up = dragToWorldAngle(phoneView, 0, -60);
assert.ok(Math.cos(up) < -0.999, "phone 'up' points toward A's goal (-x) in world space");
// On the desktop, that world direction is drawn pointing LEFT (toward the desktop player's own goal).
const s0 = toScreen(deskView, [100, 50]);
const s1 = toScreen(deskView, [100 + Math.cos(up) * 10, 50 + Math.sin(up) * 10]);
assert.ok(s1[0] < s0[0], "desktop draws the phone shot heading toward the desktop player's goal");

let turns = 0;
let rematched = false;
while (true) {
  await wait(() => (desk.phase === "planning" && desk.canPlan && phone.canPlan) || desk.phase === "ended");
  if (desk.phase === "ended") {
    // Both devices agree on the outcome
    assert.deepEqual(desk.state!.score, phone.state!.score);
    assert.equal(desk.state!.winner, phone.state!.winner);
    if (rematched) break;
    desk.rematch();
    phone.rematch();
    await wait(() => desk.state!.matchNo === 2 && desk.phase === "planning");
    assert.deepEqual(desk.state!.score, { A: 0, B: 0 });
    rematched = true;
    console.log("rematch started");
    continue;
  }
  const s = desk.state!;
  const turnId = s.turn!.id;
  // Desktop: drag from disk toward the ball, in screen space (as a user would).
  const me = toScreen(deskView, s.positions.A);
  const ball = toScreen(deskView, s.positions.ball);
  desk.setAim(dragToWorldAngle(deskView, ball[0] - me[0], ball[1] - me[1]));
  desk.setPower(2);
  // Phone: slide sideways out of the lane (drag right on the phone screen).
  phone.setAim(dragToWorldAngle(phoneView, 60, 0));
  phone.setPower(1);
  desk.lock();
  phone.lock();
  await wait(() => desk.result?.turnId === turnId && phone.result?.turnId === turnId);
  assert.deepEqual(desk.result!.final, phone.result!.final, "both clients see the same final positions");
  assert.deepEqual(desk.result!.score, phone.result!.score);
  turns++;
  if (turns > 30) throw new Error("match did not finish");
}
console.log(`crossplay ok: ${turns} turns, final ${JSON.stringify(desk.state!.score)}`);
desk.leave();
phone.leave();
process.exit(0);
