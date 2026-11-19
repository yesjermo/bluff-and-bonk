// An in-browser practice room that speaks the exact server protocol, so the same
// GameClient and UI run against it. Used when no game server is available (the
// GitHub Pages build). Mirrors the practice path of server/app/room.py.
import { chooseShot } from "./bot";
import { Bodies, describe, ShotT, Simulation } from "./physics";
import { C, Phase, Side } from "./protocol";

export interface SocketLike {
  readyState: number;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

const R = C.rules;
const SNAP_EVERY = C.physics.snapshotEvery;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const shotJson = (s: ShotT | undefined | null) => (s ? { angle: Math.round(s[0] * 1e5) / 1e5, power: s[1] } : null);
const shotsJson = (s: Partial<Record<Side, ShotT>>) => ({ A: shotJson(s.A), B: shotJson(s.B) });
const start = (tutorial: boolean): Bodies => {
  const src = tutorial ? C.tutorial : C.start;
  return { A: [...src.A] as [number, number], B: [...src.B] as [number, number], ball: [...src.ball] as [number, number] };
};

interface Turn {
  id: string;
  number: number;
  tutorial: boolean;
  deadline: number | null;
  aims: Partial<Record<Side, ShotT>>;
  locked: Partial<Record<Side, ShotT>>;
  shots: Partial<Record<Side, ShotT>> | null;
  wake: (() => void) | null;
}

class LocalPracticeRoom {
  code = "P" + Math.random().toString(36).slice(2, 5).toUpperCase();
  token = Math.random().toString(36).slice(2);
  phase: Phase = "lobby";
  phaseEnds: number | null = null;
  score = { A: 0, B: 0 };
  charges = { A: R.fullPowerCharges, B: R.fullPowerCharges };
  positions: Bodies;
  turn: Turn | null = null;
  turnCounter = 0;
  matchNo = 1;
  winner: Side | null = null;
  lastResult: Record<string, unknown> | null = null;
  rematchA = false;
  closed = false;

  constructor(private tutorialPending: boolean, private emit: (m: object) => void) {
    this.positions = start(tutorialPending);
  }

  state() {
    const t = this.turn;
    return {
      t: "state",
      room: this.code,
      practice: true,
      phase: this.phase,
      phaseEndsIn: this.phaseEnds == null ? null : Math.max(0, Math.round(this.phaseEnds - now())),
      matchNo: this.matchNo,
      turn: t && {
        id: t.id,
        number: t.number,
        tutorial: t.tutorial,
        deadlineIn: t.deadline == null ? null : Math.max(0, Math.round(t.deadline - now())),
        locked: { A: "A" in t.locked, B: "B" in t.locked },
        shots: t.shots ? shotsJson(t.shots) : null,
      },
      score: { ...this.score },
      charges: { ...this.charges },
      positions: { A: [...this.positions.A], B: [...this.positions.B], ball: [...this.positions.ball] },
      players: {
        A: { connected: true, ready: true, bot: false, rematch: this.rematchA },
        B: { connected: true, ready: true, bot: true, rematch: this.rematchA },
      },
      you: {
        side: "A",
        token: this.token,
        locked: !!t && "A" in t.locked,
        shot: shotJson(t ? (t.locked.A ?? t.aims.A) : null),
      },
      lastResult: this.lastResult,
      winner: this.winner,
      endReason: this.winner ? "goals" : null,
    };
  }

  broadcast() {
    this.emit(this.state());
  }

  handle(msg: { t: string; turnId?: string; angle?: number; power?: number; c?: number }) {
    if (msg.t === "sync" || msg.t === "ready") return this.broadcast();
    if (msg.t === "ping") return this.emit({ t: "pong", c: msg.c });
    if (msg.t === "rematch") return this.rematch();
    if (msg.t === "aim" || msg.t === "lock") {
      const t = this.turn;
      const ignore = (reason: string) => this.emit({ t: "ignored", reason, of: msg.t, turnId: msg.turnId });
      if (this.phase !== "planning" || !t) return ignore("not_planning");
      if (msg.turnId !== t.id) return ignore("stale_turn");
      if ("A" in t.locked) return ignore("already_locked");
      const angle = Number(msg.angle);
      const power = Number(msg.power);
      if (!Number.isFinite(angle) || ![1, 2, 3].includes(power)) return ignore("bad_shot");
      if (power === 3 && this.charges.A <= 0 && !t.tutorial) return ignore("no_charges");
      t.aims.A = [angle, power];
      if (msg.t === "lock") this.lock("A", [angle, power]);
    }
  }

  lock(side: Side, shot: ShotT) {
    const t = this.turn;
    if (!t || this.phase !== "planning" || side in t.locked) return;
    t.locked[side] = shot;
    this.broadcast();
    if ("A" in t.locked && "B" in t.locked) t.wake?.();
  }

  rematch() {
    if (this.phase !== "ended") return;
    this.matchNo++;
    this.score = { A: 0, B: 0 };
    this.charges = { A: R.fullPowerCharges, B: R.fullPowerCharges };
    this.winner = null;
    this.lastResult = null;
    this.turn = null;
    this.positions = start(false);
    void this.loop();
  }

  async setPhase(phase: Phase, ms: number | null) {
    this.phase = phase;
    this.phaseEnds = ms == null ? null : now() + ms;
    this.broadcast();
    if (ms) await sleep(ms);
  }

  async loop() {
    if (!this.tutorialPending) await this.setPhase("countdown", R.countdownMs);
    while (!this.winner && !this.closed) await this.playTurn();
  }

  async playTurn() {
    const tutorial = this.tutorialPending;
    const t: Turn = {
      id: Math.random().toString(36).slice(2, 14),
      number: ++this.turnCounter,
      tutorial,
      deadline: tutorial ? null : now() + R.planningMs,
      aims: {},
      locked: {},
      shots: null,
      wake: null,
    };
    this.turn = t;
    this.phase = "planning";
    this.phaseEnds = t.deadline;
    this.broadcast();

    // Bot: decides from the public board only, before any human input exists.
    if (tutorial) setTimeout(() => this.lock("B", null), 0);
    else {
      const shot = chooseShot({ positions: this.positions, side: "B", charges: this.charges.B });
      setTimeout(() => this.turn === t && this.lock("B", shot), 1600 + Math.random() * 3200);
    }

    await new Promise<void>((res) => {
      t.wake = res;
      if (t.deadline != null) setTimeout(res, t.deadline - now());
    });
    if (this.closed) return;

    this.phase = "reveal";
    const shots: Partial<Record<Side, ShotT>> = {};
    for (const side of ["A", "B"] as Side[]) {
      let shot = side in t.locked ? t.locked[side]! : (t.aims[side] ?? null);
      if (shot && shot[1] === 3 && !tutorial) {
        if (this.charges[side] > 0) this.charges[side]--;
        else shot = [shot[0], 2];
      }
      shots[side] = shot;
    }
    t.shots = shots;
    this.emit({ t: "reveal", turnId: t.id, shots: shotsJson(shots) });
    await this.setPhase("reveal", R.revealMs);

    const sim = new Simulation(this.positions, shots);
    this.phase = "simulating";
    this.phaseEnds = null;
    this.broadcast();
    const period = SNAP_EVERY * C.physics.dt * 1000;
    const t0 = now();
    let frame = 0;
    while (!sim.done) {
      sim.advance(SNAP_EVERY);
      frame++;
      this.positions = sim.positions();
      this.emit({ t: "snap", turnId: t.id, k: frame, p: this.positions });
      const delay = t0 + frame * period - now();
      if (delay > 0) await sleep(delay);
    }

    const scorer = sim.events.goal;
    const counted = !!scorer && !tutorial;
    if (counted) this.score[scorer!]++;
    const result = {
      turnId: t.id,
      shots: shotsJson(shots),
      ballPath: sim.ballPath,
      final: sim.positions(),
      goal: scorer,
      counted,
      outcome: describe(sim.events, shots),
      tutorial,
      score: { ...this.score },
    };
    this.lastResult = result;
    this.emit({ t: "result", ...result });

    if (counted && this.score[scorer!] >= R.goalsToWin) {
      this.winner = scorer;
      this.phase = "ended";
      this.phaseEnds = null;
      this.broadcast();
      return;
    }
    await this.setPhase("result", scorer ? R.goalPauseMs : R.pathShowMs);
    if (tutorial) {
      this.tutorialPending = false;
      this.positions = start(false);
      await this.setPhase("countdown", R.countdownMs);
    } else if (scorer) this.positions = start(false);
  }
}

/** A WebSocket stand-in backed by a LocalPracticeRoom. */
export function localPracticeSocket(): SocketLike {
  let room: LocalPracticeRoom | null = null;
  const sock: SocketLike = {
    readyState: 0,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data: string) {
      const msg = JSON.parse(data);
      if (!room) {
        if (msg.t === "practice") {
          room = new LocalPracticeRoom(!!msg.tutorial, (m) => setTimeout(() => sock.onmessage?.({ data: JSON.stringify(m) }), 0));
          room.broadcast();
          void room.loop();
        } else {
          const code = msg.t === "join" ? msg.room : undefined;
          sock.onmessage?.({
            data: JSON.stringify({
              t: "error",
              code: "protocol",
              room: code,
              message: "Online rooms need the game server. This build only includes offline practice.",
            }),
          });
        }
        return;
      }
      if (msg.t === "leave") return sock.close();
      room.handle(msg);
    },
    close() {
      if (room) room.closed = true;
      sock.readyState = 3;
    },
  };
  setTimeout(() => {
    sock.readyState = 1;
    sock.onopen?.();
  }, 0);
  return sock;
}
