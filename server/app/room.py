"""Room lifecycle and the authoritative turn loop.

Everything that mutates a room runs on the single asyncio event loop, and the
turn loop is one coroutine per room, so a turn is resolved exactly once: the
moment it leaves the planning phase no further lock or aim is accepted for it.
"""
from __future__ import annotations

import asyncio
import math
import random
import secrets
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

from . import bot as botmod
from .physics import C, DT, Simulation, describe, positions as body_positions

import os

# Test hook: IMPULSE_TIME_SCALE=0.2 runs every timer and the streamed simulation 5x faster.
TIME_SCALE = float(os.getenv("IMPULSE_TIME_SCALE", "1"))
R = {k: (v * TIME_SCALE if k.endswith("Ms") else v) for k, v in C["rules"].items()}
SNAP_EVERY = C["physics"]["snapshotEvery"]
SIDES = ("A", "B")


def other(side: str) -> str:
    return "B" if side == "A" else "A"


def now() -> float:
    return time.monotonic()


class Conn:
    """One WebSocket with an ordered, non-blocking outbox."""

    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.queue: asyncio.Queue[dict | None] = asyncio.Queue()
        self.closed = False
        self.sent: list[dict] = []  # kept short; used by tests via the debug hook
        self.writer = asyncio.create_task(self._write())

    async def _write(self) -> None:
        try:
            while True:
                msg = await self.queue.get()
                if msg is None:
                    return
                await self.ws.send_json(msg)
        except Exception:
            self.closed = True

    def send(self, msg: dict) -> None:
        if not self.closed:
            self.queue.put_nowait(msg)

    def close(self) -> None:
        self.closed = True
        self.queue.put_nowait(None)


@dataclass
class Player:
    side: str
    token: str
    is_bot: bool = False
    conn: Conn | None = None
    ready: bool = False
    rematch: bool = False
    disconnected_at: float | None = None

    @property
    def connected(self) -> bool:
        return self.is_bot or (self.conn is not None and not self.conn.closed)


Shot = tuple[float, int]


@dataclass
class Turn:
    id: str
    number: int
    tutorial: bool
    deadline: float | None
    aims: dict[str, Shot] = field(default_factory=dict)
    locked: dict[str, Shot | None] = field(default_factory=dict)
    all_locked: asyncio.Event = field(default_factory=asyncio.Event)
    shots: dict[str, Shot | None] | None = None  # final, set once at resolve


class Room:
    def __init__(self, code: str, practice: bool = False, tutorial: bool = False):
        self.code = code
        self.practice = practice
        self.tutorial_pending = practice and tutorial
        self.players: dict[str, Player] = {}
        self.phase = "lobby"
        self.phase_ends: float | None = None
        self.score = {"A": 0, "B": 0}
        self.charges = {"A": R["fullPowerCharges"], "B": R["fullPowerCharges"]}
        self.positions = self._start_positions()
        self.turn: Turn | None = None
        self.turn_counter = 0
        self.match_no = 1
        self.winner: str | None = None
        self.end_reason: str | None = None
        self.last_result: dict | None = None
        self.frame = 0
        self.task: asyncio.Task | None = None
        self.last_activity = now()
        self.closed = False
        self.log: list[dict] = []  # launch audit trail (tests check it)
        if practice:
            self.players["B"] = Player("B", "bot", is_bot=True, ready=True)

    # ------------------------------------------------------------ membership
    def _start_positions(self) -> dict[str, tuple[float, float]]:
        src = C["tutorial"] if self.tutorial_pending else C["start"]
        return {k: tuple(v) for k, v in src.items()}

    def add_player(self, conn: Conn) -> Player | None:
        for side in SIDES:
            if side not in self.players:
                p = Player(side, secrets.token_urlsafe(16), conn=conn)
                self.players[side] = p
                self.touch()
                return p
        return None

    def reattach(self, token: str, conn: Conn) -> Player | None:
        for p in self.players.values():
            if not p.is_bot and secrets.compare_digest(p.token, token):
                if p.conn and p.conn is not conn:
                    p.conn.close()
                p.conn = conn
                p.disconnected_at = None
                self.touch()
                return p
        return None

    def is_full(self) -> bool:
        return len(self.players) >= 2

    def touch(self) -> None:
        self.last_activity = now()

    def detach(self, conn: Conn) -> None:
        for p in self.players.values():
            if p.conn is conn:
                p.conn = None
                p.disconnected_at = now()
                if self.phase == "lobby":
                    p.ready = False
                self.broadcast_state()

    def humans_connected(self) -> int:
        return sum(1 for p in self.players.values() if not p.is_bot and p.connected)

    # ------------------------------------------------------------ messaging
    def public_state(self, viewer: str | None) -> dict[str, Any]:
        t = self.turn
        turn_info = None
        if t:
            turn_info = {
                "id": t.id,
                "number": t.number,
                "tutorial": t.tutorial,
                "deadlineIn": None if t.deadline is None else max(0, int((t.deadline - now()) * 1000)),
                "locked": {s: (s in t.locked) for s in SIDES},
                # Shots become public only once the turn has been resolved.
                "shots": _shots_json(t.shots) if t.shots is not None else None,
            }
        you = None
        if viewer and viewer in self.players:
            mine_locked = bool(t and viewer in t.locked)
            mine = t.locked.get(viewer) if mine_locked else (t.aims.get(viewer) if t else None)
            you = {
                "side": viewer,
                "token": self.players[viewer].token,
                "locked": mine_locked,
                "shot": _shot_json(mine),
            }
        return {
            "t": "state",
            "room": self.code,
            "practice": self.practice,
            "phase": self.phase,
            "phaseEndsIn": None if self.phase_ends is None else max(0, int((self.phase_ends - now()) * 1000)),
            "matchNo": self.match_no,
            "turn": turn_info,
            "score": self.score,
            "charges": self.charges,
            "positions": {k: list(v) for k, v in self.positions.items()},
            "players": {
                s: {
                    "connected": p.connected,
                    "ready": p.ready,
                    "bot": p.is_bot,
                    "rematch": p.rematch,
                }
                for s, p in self.players.items()
            },
            "you": you,
            "lastResult": self.last_result,
            "winner": self.winner,
            "endReason": self.end_reason,
        }

    def send_state(self, side: str) -> None:
        p = self.players.get(side)
        if p and p.conn:
            p.conn.send(self.public_state(side))

    def broadcast_state(self) -> None:
        for side in self.players:
            self.send_state(side)

    def broadcast(self, msg: dict) -> None:
        for p in self.players.values():
            if p.conn:
                p.conn.send(msg)

    def reply(self, side: str, msg: dict) -> None:
        p = self.players.get(side)
        if p and p.conn:
            p.conn.send(msg)

    # ------------------------------------------------------------ input
    def handle(self, side: str, msg: dict) -> None:
        self.touch()
        kind = msg.get("t")
        if kind == "ready":
            self.players[side].ready = True
            self.broadcast_state()
            self._maybe_start()
        elif kind == "aim":
            self._on_aim(side, msg, lock=False)
        elif kind == "lock":
            self._on_aim(side, msg, lock=True)
        elif kind == "rematch":
            self._on_rematch(side)
        elif kind == "sync":
            self.send_state(side)
        elif kind == "ping":
            self.reply(side, {"t": "pong", "c": msg.get("c")})

    def _validate(self, side: str, msg: dict) -> tuple[Shot | None, str | None]:
        t = self.turn
        if self.phase != "planning" or t is None:
            return None, "not_planning"
        if msg.get("turnId") != t.id:
            return None, "stale_turn"
        if side in t.locked:
            return None, "already_locked"
        try:
            angle = float(msg.get("angle"))
            power = int(msg.get("power"))
        except (TypeError, ValueError):
            return None, "bad_shot"
        if not math.isfinite(angle) or power not in (1, 2, 3):
            return None, "bad_shot"
        if power == 3 and self.charges[side] <= 0 and not t.tutorial:
            return None, "no_charges"
        return (math.remainder(angle, 2 * math.pi), power), None

    def _on_aim(self, side: str, msg: dict, lock: bool) -> None:
        shot, err = self._validate(side, msg)
        if err:
            self.reply(side, {"t": "ignored", "reason": err, "of": msg.get("t"), "turnId": msg.get("turnId")})
            if err == "already_locked":
                self.send_state(side)
            return
        t = self.turn
        assert t is not None
        t.aims[side] = shot  # private: never sent to the opponent
        if lock:
            self._lock(side, shot)

    def _lock(self, side: str, shot: Shot | None) -> None:
        t = self.turn
        if t is None or self.phase != "planning" or side in t.locked:
            return
        t.locked[side] = shot
        self.broadcast_state()  # opponent learns only "locked: true"
        if all(s in t.locked for s in self.players):
            t.all_locked.set()

    def _on_rematch(self, side: str) -> None:
        if self.phase != "ended":
            return
        self.players[side].rematch = True
        if self.practice:
            self.players["B"].rematch = True
        self.broadcast_state()
        if all(p.rematch for p in self.players.values()) and len(self.players) == 2:
            self.match_no += 1
            self.score = {"A": 0, "B": 0}
            self.charges = {"A": R["fullPowerCharges"], "B": R["fullPowerCharges"]}
            self.winner = None
            self.end_reason = None
            self.last_result = None
            self.turn = None
            for p in self.players.values():
                p.rematch = False
            self.positions = self._start_positions()
            self._start_loop()

    def _maybe_start(self) -> None:
        if self.phase != "lobby" or len(self.players) < 2:
            return
        if all(p.ready and p.connected for p in self.players.values()):
            self._start_loop()

    def _start_loop(self) -> None:
        if self.task and not self.task.done():
            return
        self.task = asyncio.create_task(self._match_loop())

    # ------------------------------------------------------------ turn loop
    async def _set_phase(self, phase: str, duration_ms: float | None = None) -> None:
        self.phase = phase
        self.phase_ends = None if duration_ms is None else now() + duration_ms / 1000
        self.broadcast_state()
        if duration_ms:
            await asyncio.sleep(duration_ms / 1000)

    async def _match_loop(self) -> None:
        try:
            if not self.tutorial_pending:
                await self._set_phase("countdown", R["countdownMs"])
            while self.winner is None and not self.closed:
                await self._play_turn()
        except asyncio.CancelledError:
            pass

    async def _play_turn(self) -> None:
        self.turn_counter += 1
        tutorial = self.tutorial_pending
        deadline = None if tutorial else now() + R["planningMs"] / 1000
        t = Turn(uuid.uuid4().hex[:12], self.turn_counter, tutorial, deadline)
        self.turn = t
        self.phase = "planning"
        self.phase_ends = deadline
        self.broadcast_state()

        bot = next((p for p in self.players.values() if p.is_bot), None)
        if bot:
            asyncio.create_task(self._bot_turn(bot.side, t))

        try:
            if deadline is None:
                await t.all_locked.wait()
            else:
                await asyncio.wait_for(t.all_locked.wait(), timeout=max(0.0, deadline - now()))
        except asyncio.TimeoutError:
            pass

        # ---- resolve exactly once: leaving "planning" closes the turn.
        self.phase = "reveal"
        shots: dict[str, Shot | None] = {}
        for side in self.players:
            shot = t.locked[side] if side in t.locked else t.aims.get(side)
            if shot and shot[1] == 3 and not tutorial:
                if self.charges[side] > 0:
                    self.charges[side] -= 1  # spent only because it launches
                else:
                    shot = (shot[0], 2)
            shots[side] = shot
        t.shots = shots
        self.log.append({"turnId": t.id, "shots": _shots_json(shots)})
        self.broadcast({"t": "reveal", "turnId": t.id, "shots": _shots_json(shots)})
        await self._set_phase("reveal", R["revealMs"])

        # ---- authoritative simulation, streamed in real time
        sim = Simulation(self.positions, shots)
        self.phase = "simulating"
        self.phase_ends = None
        self.frame = 0
        self.broadcast_state()
        period = SNAP_EVERY * DT * TIME_SCALE
        start = now()
        while not sim.done:
            sim.advance(SNAP_EVERY)
            self.frame += 1
            self.positions = {k: tuple(v) for k, v in body_positions(sim.bodies).items()}
            self.broadcast({"t": "snap", "turnId": t.id, "k": self.frame, "p": body_positions(sim.bodies)})
            delay = start + self.frame * period - now()
            if delay > 0:
                await asyncio.sleep(delay)

        outcome = describe(sim.events, shots)
        scorer = sim.events.goal
        counted = bool(scorer) and not tutorial
        if counted:
            self.score[scorer] += 1
        result = {
            "turnId": t.id,
            "shots": _shots_json(shots),
            "ballPath": sim.ball_path,
            "final": body_positions(sim.bodies),
            "goal": scorer,
            "counted": counted,
            "outcome": outcome,
            "tutorial": tutorial,
            "score": dict(self.score),
        }
        self.last_result = result
        self.broadcast({"t": "result", **result})

        if counted and self.score[scorer] >= R["goalsToWin"]:
            self.winner = scorer
            self.end_reason = "goals"
            self.phase = "ended"
            self.phase_ends = None
            self.broadcast_state()
            return

        await self._set_phase("result", R["goalPauseMs"] if scorer else R["pathShowMs"])
        if tutorial:
            self.tutorial_pending = False
            self.positions = self._start_positions()
            await self._set_phase("countdown", R["countdownMs"])
        elif scorer:
            self.positions = self._start_positions()

    async def _bot_turn(self, side: str, t: Turn) -> None:
        if t.tutorial:
            # The practice opponent waits out the teaching shot.
            self._lock(side, None)
            return
        board = botmod.PublicBoard(
            positions=dict(self.positions),
            side=side,
            charges=self.charges[side],
            score=dict(self.score),
        )
        started = now()
        shot = await asyncio.to_thread(botmod.choose_shot, board)
        think = random.uniform(1.6, 4.8) * TIME_SCALE
        await asyncio.sleep(max(0.0, think - (now() - started)))
        if self.turn is t and self.phase == "planning":
            self._lock(side, shot)

    # ------------------------------------------------------------ housekeeping
    def tick(self) -> None:
        """Called periodically: forfeits and lobby slot release."""
        for p in list(self.players.values()):
            if p.is_bot or p.connected or p.disconnected_at is None:
                continue
            gone = now() - p.disconnected_at
            if gone < R["rejoinWindowMs"] / 1000:
                continue
            if self.phase == "lobby":
                del self.players[p.side]
                self.broadcast_state()
            elif self.phase != "ended" and not self.practice:
                self.winner = other(p.side)
                self.end_reason = "forfeit"
                if self.task:
                    self.task.cancel()
                self.phase = "ended"
                self.phase_ends = None
                self.broadcast_state()

    def close(self) -> None:
        self.closed = True
        if self.task:
            self.task.cancel()
        for p in self.players.values():
            if p.conn:
                p.conn.close()


def _shot_json(shot: Shot | None) -> dict | None:
    return None if shot is None else {"angle": round(shot[0], 5), "power": shot[1]}


def _shots_json(shots: dict[str, Shot | None]) -> dict[str, dict | None]:
    return {s: _shot_json(v) for s, v in shots.items()}
