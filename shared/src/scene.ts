// Builds the render Scene from client state; shared by web and mobile so both
// show the same arrows, trails and pulses at the same moments.
import type { GameClient } from "./client";
import { C, Side } from "./protocol";
import type { Arrow, Scene } from "./render";

export function buildScene(client: GameClient, timeMs: number, reducedMotion: boolean): Scene | null {
  const s = client.state;
  if (!s) return null;
  const positions = client.positions();
  const you = client.side;
  const arrows: Arrow[] = [];
  const phase = s.phase;

  if (phase === "planning" && you && client.aim != null) {
    arrows.push({
      side: you,
      shot: { angle: client.aim, power: client.power },
      from: s.positions[you],
      locked: client.locked,
    });
  }
  if (phase === "reveal" && client.reveal) {
    const el = client.elapsedSince(client.reveal.at);
    const progress = reducedMotion ? 1 : Math.min(1, el / 170);
    for (const side of ["A", "B"] as Side[]) {
      const shot = client.reveal.shots[side];
      if (shot) arrows.push({ side, shot, from: s.positions[side], locked: true, progress });
    }
  }

  let trail: Scene["trail"] = null;
  let goalPulse: Scene["goalPulse"] = null;
  const r = client.result;
  if (r && (phase === "result" || phase === "ended" || phase === "countdown")) {
    const el = client.elapsedSince(r.at);
    const hold = C.rules.pathShowMs * 1.4;
    const alpha = phase === "ended" ? 0.8 : el < hold ? 1 : Math.max(0, 1 - (el - hold) / 600);
    if (alpha > 0) trail = { points: r.ballPath, alpha };
    if (r.goal && el < 900) goalPulse = { side: r.goal, t: reducedMotion ? 0 : el / 900 };
  }

  const snapEl = client.elapsedSince(client.lockedAt);
  const lockSnap = !reducedMotion && snapEl < 180 ? snapEl / 180 : null;

  return {
    positions,
    you,
    arrows,
    trail,
    goalPulse,
    lockSnap,
    highlightBall: !!s.turn?.tutorial && phase === "planning" && client.aim == null,
    timeMs,
    reducedMotion,
  };
}
