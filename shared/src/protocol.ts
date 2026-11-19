// One WebSocket protocol for web, iOS and Android. Mirrors server/app/room.py.
import constants from "../constants.json";

export const C = constants;
export type Side = "A" | "B";
export type Power = 1 | 2 | 3;
export type Vec = [number, number];

export interface Shot {
  angle: number; // world-space radians
  power: Power;
}

export type Phase = "lobby" | "countdown" | "planning" | "reveal" | "simulating" | "result" | "ended";

export interface TurnInfo {
  id: string;
  number: number;
  tutorial: boolean;
  deadlineIn: number | null;
  locked: Record<Side, boolean>;
  shots: Partial<Record<Side, Shot | null>> | null; // null until the turn resolves
}

export interface Outcome {
  kind: "direct" | "bank" | "own_goal" | "block" | "miss" | "bank_miss" | "disks" | "still";
  scorer?: Side;
  by?: Side;
}

export interface TurnResult {
  turnId: string;
  shots: Partial<Record<Side, Shot | null>>;
  ballPath: Vec[];
  final: Record<"A" | "B" | "ball", Vec>;
  goal: Side | null;
  counted: boolean;
  outcome: Outcome;
  tutorial: boolean;
  score: Record<Side, number>;
}

export interface PlayerInfo {
  connected: boolean;
  ready: boolean;
  bot: boolean;
  rematch: boolean;
}

export interface PublicState {
  t: "state";
  room: string;
  practice: boolean;
  phase: Phase;
  phaseEndsIn: number | null;
  matchNo: number;
  turn: TurnInfo | null;
  score: Record<Side, number>;
  charges: Record<Side, number>;
  positions: Record<"A" | "B" | "ball", Vec>;
  players: Partial<Record<Side, PlayerInfo>>;
  you: { side: Side; token: string; locked: boolean; shot: Shot | null } | null;
  lastResult: TurnResult | null;
  winner: Side | null;
  endReason: "goals" | "forfeit" | null;
}

export type ServerMsg =
  | PublicState
  | { t: "reveal"; turnId: string; shots: Partial<Record<Side, Shot | null>> }
  | { t: "snap"; turnId: string; k: number; p: Record<"A" | "B" | "ball", Vec> }
  | ({ t: "result" } & TurnResult)
  | { t: "error"; code: "invalid" | "full" | "expired" | "protocol"; room?: string; message: string }
  | { t: "ignored"; reason: string; of: string; turnId?: string }
  | { t: "pong"; c: number };

export type ClientMsg =
  | { t: "create" }
  | { t: "practice"; tutorial: boolean }
  | { t: "join"; room: string; token?: string }
  | { t: "ready" }
  | { t: "aim"; turnId: string; angle: number; power: Power }
  | { t: "lock"; turnId: string; angle: number; power: Power }
  | { t: "rematch" }
  | { t: "sync" }
  | { t: "leave" }
  | { t: "ping"; c: number };

export const other = (s: Side): Side => (s === "A" ? "B" : "A");

export const SIDE_COLOR: Record<Side, string> = { A: "#2CE3F2", B: "#FF8A2A" };
export const SIDE_NAME: Record<Side, string> = { A: "Cyan", B: "Tangerine" };

export const SNAP_PERIOD_MS = C.physics.snapshotEvery * C.physics.dt * 1000;

export const POWER_INFO: Record<Power, { label: string; cost: string }> = {
  1: { label: "Tap", cost: "Free" },
  2: { label: "Drive", cost: "Free" },
  3: { label: "Full", cost: "Uses 1 charge" },
};

export function describeOutcome(r: TurnResult, you: Side | null): string {
  const name = (s?: Side) => (s ? (s === you ? "You" : you ? "Opponent" : SIDE_NAME[s]) : "");
  const o = r.outcome;
  if (r.goal) {
    const who = name(r.goal);
    const tag = o.kind === "bank" ? "Bank shot" : o.kind === "own_goal" ? "Own goal" : "Direct shot";
    if (r.tutorial) return `${tag}! That's the idea.`;
    return `${tag} — ${who} ${who === "You" ? "score" : "scores"}`;
  }
  switch (o.kind) {
    case "block":
      return `Blocked by ${name(o.by) === "You" ? "you" : name(o.by)}`;
    case "bank_miss":
      return "Off the boards — no goal";
    case "disks":
      return "Disks collided — ball untouched";
    case "still":
      return "Nobody moved";
    default:
      return "Miss";
  }
}
