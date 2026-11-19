// Text for the reserved message strip and the scoreboard, shared by web and mobile.
import type { GameClient } from "./client";
import { C, describeOutcome, other } from "./protocol";

export type Tone = "info" | "good" | "warn" | "alert";

export interface StripMessage {
  text: string;
  tone: Tone;
}

export function stripMessage(c: GameClient, powerTouched: boolean, touch: boolean): StripMessage {
  const s = c.state;
  if (!s) return { text: "Connecting…", tone: "info" };
  if (c.status !== "open" || !c.synced) return { text: "Reconnecting — your shot is safe on the server…", tone: "alert" };
  const you = c.side;
  const opp = you ? s.players[other(you)] : undefined;
  if (s.phase !== "ended" && opp && !opp.connected) return { text: "Opponent disconnected — waiting for them to rejoin…", tone: "warn" };
  const t = s.turn;
  const oppLocked = !!(you && t?.locked[other(you)]);
  switch (s.phase) {
    case "countdown": {
      const n = Math.max(1, Math.ceil((c.phaseLeft() ?? 0) / 1000));
      return { text: c.result?.tutorial ? `Now for real: 8-second timer, and the opponent shoots too. ${n}…` : `Get ready… ${n}`, tone: "info" };
    }
    case "planning": {
      if (t?.tutorial) {
        if (c.locked) return { text: "Shot locked. Here it goes…", tone: "good" };
        if (c.aim == null)
          return { text: touch ? "Drag anywhere on the rink toward the goal. The arrow starts at your disk." : "Drag on the rink (or press ← →) to aim. The arrow starts at your disk.", tone: "info" };
        if (!powerTouched) return { text: "Pick a power. Level 3 hits hardest but uses one of your 2 charges.", tone: "info" };
        return { text: `Press Lock shot${touch ? "" : " (or Space)"}. No timer on this practice shot.`, tone: "info" };
      }
      if (c.locked) return { text: oppLocked ? "Both locked — revealing…" : "Shot locked — waiting for opponent", tone: "good" };
      if (oppLocked) return { text: "Opponent locked", tone: "warn" };
      if (c.aim == null) return { text: touch ? "Drag on the rink to aim" : "Drag or ← → to aim · 1–3 power · Space locks", tone: "info" };
      return { text: "Aim set — lock it in before time runs out", tone: "info" };
    }
    case "reveal":
      return { text: "Reveal!", tone: "info" };
    case "simulating":
      return { text: " ", tone: "info" };
    case "result":
      return c.result ? { text: describeOutcome(c.result, you), tone: c.result.goal ? (c.result.goal === you ? "good" : "alert") : "info" } : { text: " ", tone: "info" };
    case "ended":
      if (s.endReason === "forfeit") return { text: s.winner === you ? "Opponent left — you win" : "You left the match", tone: "warn" };
      return { text: s.winner === you ? "You win the duel" : "Opponent wins the duel", tone: s.winner === you ? "good" : "alert" };
    default:
      return { text: " ", tone: "info" };
  }
}

export interface TimerInfo {
  label: string; // big text
  sub: string; // small caption (never color-only)
  fraction: number; // 0..1 remaining
  warn: boolean;
}

export function timerInfo(c: GameClient): TimerInfo {
  const s = c.state;
  if (!s) return { label: "–", sub: "", fraction: 0, warn: false };
  if (s.phase === "countdown") {
    const left = c.phaseLeft() ?? 0;
    return { label: String(Math.max(1, Math.ceil(left / 1000))), sub: "START", fraction: left / C.rules.countdownMs, warn: false };
  }
  if (s.phase === "planning") {
    if (s.turn?.tutorial) return { label: "∞", sub: "NO TIMER", fraction: 1, warn: false };
    const left = c.timeLeft() ?? 0;
    const warn = left <= 3000;
    return { label: String(Math.ceil(left / 1000)), sub: warn ? "HURRY" : "PLAN", fraction: left / C.rules.planningMs, warn };
  }
  if (s.phase === "reveal") return { label: "GO", sub: "REVEAL", fraction: 0, warn: false };
  if (s.phase === "simulating" || s.phase === "result") return { label: "·", sub: "LIVE", fraction: 0, warn: false };
  if (s.phase === "ended") return { label: "FT", sub: "FINAL", fraction: 0, warn: false };
  return { label: "–", sub: "", fraction: 0, warn: false };
}
