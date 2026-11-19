// Platform-neutral game client: WebSocket session, reconnection, local aim,
// and snapshot interpolation. Web and mobile both drive their UI from this.
import {
  C,
  ClientMsg,
  Phase,
  Power,
  PublicState,
  ServerMsg,
  SNAP_PERIOD_MS,
  Shot,
  Side,
  TurnResult,
  Vec,
} from "./protocol";
import type { SocketLike } from "./localRoom";

export interface KeyValueStore {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string): Promise<void> | void;
}

export type ConnStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface ClientError {
  code: string;
  message: string;
  room?: string;
}

type Bodies = Record<"A" | "B" | "ball", Vec>;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const INTERP_DELAY_MS = 80;

export function wsUrlFromHttp(base: string): string {
  const u = base.replace(/\/+$/, "");
  return u.replace(/^http/, "ws") + "/ws";
}

export class GameClient {
  status: ConnStatus = "idle";
  /** False after (re)connecting until the server's current state arrives; disable controls meanwhile. */
  synced = false;
  state: PublicState | null = null;
  error: ClientError | null = null;
  /** Local, private aim for the current turn. Sent only to the server. */
  aim: number | null = null;
  power: Power = 2;
  lockPending = false;
  reveal: { turnId: string; shots: Partial<Record<Side, Shot | null>>; at: number } | null = null;
  result: (TurnResult & { at: number }) | null = null;
  deadlineAt: number | null = null; // local clock
  phaseEndsAt: number | null = null;
  lockedAt: number | null = null;

  private ws: SocketLike | null = null;
  private listeners = new Set<() => void>();
  private intro: ClientMsg | null = null;
  private room: string | null = null;
  private token: string | null = null;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private turnId: string | null = null;
  private snaps: { k: number; p: Bodies }[] = [];
  private playStart = 0;
  private playK0 = 0;
  private aimTimer: ReturnType<typeof setTimeout> | null = null;
  private wantClose = false;

  /** Optional wire tap (debugging / privacy checks). */
  onRaw?: (raw: string) => void;

  constructor(
    private wsUrl: string,
    private store: KeyValueStore,
    /** When set, practice runs on this in-browser socket instead of the server. */
    private localPractice?: () => SocketLike,
  ) {}

  /** True when online rooms are unavailable (offline-practice-only build). */
  get offlineOnly(): boolean {
    return !this.wsUrl && !!this.localPractice;
  }

  // ---------------------------------------------------------------- lifecycle
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  create(): void {
    this.start({ t: "create" });
  }

  practice(tutorial: boolean): void {
    this.start({ t: "practice", tutorial });
  }

  async join(code: string): Promise<void> {
    const room = code.trim().toUpperCase();
    const token = (await this.store.get(`impulse.token.${room}`)) || undefined;
    this.start({ t: "join", room, token });
  }

  leave(): void {
    this.wantClose = true;
    this.send({ t: "leave" });
    this.teardown();
    this.state = null;
    this.room = null;
    this.token = null;
    this.error = null;
    this.status = "idle";
    this.emit();
  }

  /** Call when the app returns to the foreground or the network comes back. */
  resume(): void {
    if (!this.room) return;
    this.synced = false;
    this.emit();
    if (this.ws && this.ws.readyState === 1) this.send({ t: "sync" });
    else this.reconnect(true);
  }

  private start(intro: ClientMsg): void {
    this.teardown();
    this.wantClose = false;
    this.intro = intro;
    this.error = null;
    this.state = null;
    this.room = null;
    this.token = null;
    this.turnId = null;
    this.resetTurn();
    this.open("connecting");
  }

  private teardown(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
  }

  private open(status: ConnStatus): void {
    this.status = status;
    this.synced = false;
    this.emit();
    const local = this.localPractice && (this.intro?.t === "practice" || this.room?.startsWith("P") || !this.wsUrl);
    const ws: SocketLike = local ? this.localPractice!() : (new WebSocket(this.wsUrl) as unknown as SocketLike);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.status = "open";
      if (this.room && this.token) this.send({ t: "join", room: this.room, token: this.token });
      else if (this.intro) this.send(this.intro);
      this.emit();
    };
    ws.onmessage = (ev: { data: unknown }) => {
      this.onRaw?.(String(ev.data));
      this.onMessage(JSON.parse(String(ev.data)) as ServerMsg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.wantClose || this.error) {
        this.status = "closed";
        this.emit();
        return;
      }
      this.reconnect(false);
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private reconnect(immediate: boolean): void {
    this.teardown();
    if (!this.room && !this.intro) return;
    this.status = "reconnecting";
    this.synced = false;
    this.emit();
    const delay = immediate ? 0 : Math.min(4000, 300 * 2 ** this.retry++);
    this.retryTimer = setTimeout(() => this.open("reconnecting"), delay);
  }

  private send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  // ---------------------------------------------------------------- inbound
  private onMessage(m: ServerMsg): void {
    switch (m.t) {
      case "state":
        this.onState(m);
        break;
      case "reveal":
        this.reveal = { turnId: m.turnId, shots: m.shots, at: now() };
        break;
      case "snap":
        if (m.turnId !== this.turnId) return;
        if (!this.snaps.length) {
          this.playStart = now();
          this.playK0 = m.k - 1;
        }
        this.snaps.push({ k: m.k, p: m.p });
        if (this.snaps.length > 240) this.snaps.splice(0, 120);
        return; // no UI re-render per snapshot
      case "result":
        this.result = { ...m, at: now() };
        break;
      case "error":
        this.error = { code: m.code, message: m.message, room: m.room };
        this.wantClose = true;
        this.teardown();
        this.status = "closed";
        break;
      case "ignored":
        if (m.of === "lock") this.lockPending = false;
        if (m.reason === "stale_turn" || m.reason === "not_planning") this.send({ t: "sync" });
        break;
      default:
        return;
    }
    this.emit();
  }

  private onState(s: PublicState): void {
    const prevTurn = this.turnId;
    this.state = s;
    this.synced = true;
    this.room = s.room;
    this.intro = null;
    if (s.you) {
      this.token = s.you.token;
      void this.store.set(`impulse.token.${s.room}`, s.you.token);
    }
    const t = s.turn;
    if (t && t.id !== prevTurn) {
      this.resetTurn();
      this.turnId = t.id;
      // Full power never carries over between turns, so a charge is never spent by accident.
      if (this.power === 3) this.power = 2;
    }
    // The server is the source of truth for our own lock (survives reconnects).
    if (s.you) {
      if (s.you.locked) {
        if (this.lockedAt == null) this.lockedAt = now();
        this.lockPending = false;
        if (s.you.shot) {
          this.aim = s.you.shot.angle;
          this.power = s.you.shot.power;
        }
      } else if (s.you.shot && this.aim == null && s.phase === "planning") {
        this.aim = s.you.shot.angle;
        this.power = s.you.shot.power;
      }
    }
    if (t?.shots && (!this.reveal || this.reveal.turnId !== t.id)) {
      // Rejoined after the reveal: show it without replaying the arrows.
      this.reveal = { turnId: t.id, shots: t.shots, at: now() - 10_000 };
    }
    if (s.lastResult && (!this.result || this.result.turnId !== s.lastResult.turnId) && t && s.lastResult.turnId === t.id) {
      this.result = { ...s.lastResult, at: now() - 400 };
    }
    this.deadlineAt = t?.deadlineIn != null && s.phase === "planning" ? now() + t.deadlineIn : null;
    this.phaseEndsAt = s.phaseEndsIn != null ? now() + s.phaseEndsIn : null;
    if (s.phase !== "simulating" && s.phase !== "reveal") this.snaps = [];
  }

  private resetTurn(): void {
    this.aim = null;
    this.lockPending = false;
    this.lockedAt = null;
    this.reveal = null;
    this.result = null;
    this.snaps = [];
    if (this.aimTimer) clearTimeout(this.aimTimer);
    this.aimTimer = null;
  }

  // ---------------------------------------------------------------- outbound
  get side(): Side | null {
    return this.state?.you?.side ?? null;
  }

  get phase(): Phase | null {
    return this.state?.phase ?? null;
  }

  get locked(): boolean {
    return !!this.state?.you?.locked || this.lockPending;
  }

  get canPlan(): boolean {
    return this.synced && this.phase === "planning" && !this.locked && this.status === "open";
  }

  chargesLeft(side: Side | null = this.side): number {
    return side && this.state ? this.state.charges[side] : C.rules.fullPowerCharges;
  }

  powerAvailable(p: Power): boolean {
    if (p !== 3) return true;
    return !!this.state?.turn?.tutorial || this.chargesLeft() > 0;
  }

  setAim(angle: number): void {
    if (!this.canPlan) return;
    this.aim = angle;
    this.queueAim();
    this.emit();
  }

  setPower(p: Power): void {
    if (!this.canPlan || !this.powerAvailable(p)) return;
    this.power = p;
    this.queueAim();
    this.emit();
  }

  private queueAim(): void {
    // Latest valid aim goes to the server (only the server) so a timeout fires it.
    if (this.aim == null || !this.state?.turn) return;
    if (this.aimTimer) clearTimeout(this.aimTimer);
    this.aimTimer = setTimeout(() => {
      if (this.aim == null || !this.state?.turn || !this.canPlan) return;
      this.send({ t: "aim", turnId: this.state.turn.id, angle: this.aim, power: this.power });
    }, 60);
  }

  lock(): boolean {
    if (!this.canPlan || this.aim == null || !this.state?.turn) return false;
    if (this.aimTimer) clearTimeout(this.aimTimer);
    this.lockPending = true;
    this.lockedAt = now();
    this.send({ t: "lock", turnId: this.state.turn.id, angle: this.aim, power: this.power });
    this.emit();
    return true;
  }

  ready(): void {
    this.send({ t: "ready" });
  }

  rematch(): void {
    this.send({ t: "rematch" });
  }

  // ---------------------------------------------------------------- rendering
  /** Interpolated body positions for the current render time. */
  positions(): Bodies {
    const s = this.state;
    if (!s) return { A: [0, 0], B: [0, 0], ball: [0, 0] } as Bodies;
    if (this.snaps.length && (s.phase === "simulating" || s.phase === "reveal")) {
      const last = this.snaps[this.snaps.length - 1];
      let f = this.playK0 + (now() - this.playStart - INTERP_DELAY_MS) / SNAP_PERIOD_MS;
      if (last.k - f > 6) {
        // Fell behind (jitter or a backgrounded tab): catch up instead of drifting.
        this.playStart = now() - INTERP_DELAY_MS - (last.k - 2 - this.playK0) * SNAP_PERIOD_MS;
        f = last.k - 2;
      }
      if (f >= last.k) return last.p;
      let i = this.snaps.findIndex((q) => q.k > f);
      if (i <= 0) {
        if (i === 0 && this.snaps[0].k - 1 <= this.playK0) return lerpBodies(s.positions, this.snaps[0].p, f - this.playK0);
        return this.snaps[0].p;
      }
      const a = this.snaps[i - 1];
      const b = this.snaps[i];
      return lerpBodies(a.p, b.p, (f - a.k) / (b.k - a.k));
    }
    if (this.result && this.result.turnId === this.turnId && s.phase === "result") return this.result.final;
    return s.positions;
  }

  /** Remaining planning time in ms, or null when untimed. */
  timeLeft(): number | null {
    return this.deadlineAt == null ? null : Math.max(0, this.deadlineAt - now());
  }

  phaseLeft(): number | null {
    return this.phaseEndsAt == null ? null : Math.max(0, this.phaseEndsAt - now());
  }

  elapsedSince(t: number | null | undefined): number {
    return t == null ? Infinity : now() - t;
  }
}

function lerpBodies(a: Bodies, b: Bodies, t: number): Bodies {
  const k = Math.max(0, Math.min(1, t));
  const l = (p: Vec, q: Vec): Vec => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  return { A: l(a.A, b.A), B: l(a.B, b.B), ball: l(a.ball, b.ball) };
}
