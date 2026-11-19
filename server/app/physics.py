"""Authoritative fixed-timestep rink physics.

World units: x runs along the rink length (0 = side A's goal line, L = side B's
goal line), y runs across it (0..W). The geometry is shared with the clients via
shared/constants.json so every renderer draws the same arena.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path

CONSTANTS_PATH = Path(__file__).resolve().parents[2] / "shared" / "constants.json"
C = json.loads(CONSTANTS_PATH.read_text())

L = C["rink"]["length"]
W = C["rink"]["width"]
GW = C["rink"]["goalWidth"]
GD = C["rink"]["goalDepth"]
G0 = (W - GW) / 2  # goal opening lower y
G1 = (W + GW) / 2  # goal opening upper y

DISK_R = C["bodies"]["diskRadius"]
BALL_R = C["bodies"]["ballRadius"]
DISK_M = C["bodies"]["diskMass"]
BALL_M = C["bodies"]["ballMass"]

P = C["physics"]
DT = P["dt"]
SUB = P["substeps"]
SPEEDS = C["shots"]["speeds"]

# Wall segments (x1, y1, x2, y2). Corners and goal posts are handled by the
# closest-point test, so bodies bounce off post ends consistently.
WALLS: list[tuple[float, float, float, float]] = [
    (0, 0, L, 0),  # top board
    (0, W, L, W),  # bottom board
    # side A end board with opening
    (0, 0, 0, G0),
    (0, G1, 0, W),
    # side A goal pocket
    (0, G0, -GD, G0),
    (0, G1, -GD, G1),
    (-GD, G0, -GD, G1),
    # side B end board with opening
    (L, 0, L, G0),
    (L, G1, L, W),
    (L, G0, L + GD, G0),
    (L, G1, L + GD, G1),
    (L + GD, G0, L + GD, G1),
]

# Disks can't enter the nets: only the ball crosses the goal lines. This stops a
# disk from parking inside its own goal as an unbeatable keeper.
DISK_WALLS = WALLS + [(0, G0, 0, G1), (L, G0, L, G1)]


@dataclass
class Body:
    kind: str  # "A", "B" or "ball"
    x: float
    y: float
    r: float
    m: float
    friction: float
    rest_wall: float
    vx: float = 0.0
    vy: float = 0.0

    @property
    def speed(self) -> float:
        return math.hypot(self.vx, self.vy)


@dataclass
class SimEvents:
    """What happened during one launch, used to explain the outcome."""

    contacts: list[tuple[str, str]] = field(default_factory=list)  # ordered (kind, detail)
    goal: str | None = None  # side that SCORED ("A" or "B")
    goal_step: int | None = None

    def add(self, kind: str, detail: str) -> None:
        if not self.contacts or self.contacts[-1] != (kind, detail):
            self.contacts.append((kind, detail))


def make_bodies(pos: dict[str, tuple[float, float]]) -> list[Body]:
    return [
        Body("A", *pos["A"], DISK_R, DISK_M, P["diskFriction"], P["wallRestitution"]),
        Body("B", *pos["B"], DISK_R, DISK_M, P["diskFriction"], P["wallRestitution"]),
        Body("ball", *pos["ball"], BALL_R, BALL_M, P["ballFriction"], P["ballWallRestitution"]),
    ]


def launch(bodies: list[Body], shots: dict[str, tuple[float, int] | None]) -> None:
    for b in bodies:
        shot = shots.get(b.kind)
        if shot:
            angle, power = shot
            v = SPEEDS[power]
            b.vx, b.vy = math.cos(angle) * v, math.sin(angle) * v


def _collide_wall(b: Body, seg, events: SimEvents) -> None:
    x1, y1, x2, y2 = seg
    dx, dy = x2 - x1, y2 - y1
    t = ((b.x - x1) * dx + (b.y - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = x1 + t * dx, y1 + t * dy
    ox, oy = b.x - cx, b.y - cy
    d = math.hypot(ox, oy)
    if d >= b.r or d == 0:
        return
    nx, ny = ox / d, oy / d
    b.x += nx * (b.r - d)
    b.y += ny * (b.r - d)
    vn = b.vx * nx + b.vy * ny
    if vn < 0:
        b.vx -= (1 + b.rest_wall) * vn * nx
        b.vy -= (1 + b.rest_wall) * vn * ny
        if b.kind == "ball" and -vn > 8:
            events.add("wall", "")


def _collide_bodies(a: Body, b: Body, events: SimEvents) -> None:
    ox, oy = b.x - a.x, b.y - a.y
    d = math.hypot(ox, oy)
    min_d = a.r + b.r
    if d >= min_d or d == 0:
        return
    nx, ny = ox / d, oy / d
    overlap = min_d - d
    inv_a, inv_b = 1 / a.m, 1 / b.m
    total = inv_a + inv_b
    a.x -= nx * overlap * inv_a / total
    a.y -= ny * overlap * inv_a / total
    b.x += nx * overlap * inv_b / total
    b.y += ny * overlap * inv_b / total
    rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
    if rv < 0:
        j = -(1 + P["bodyRestitution"]) * rv / total
        a.vx -= j * nx * inv_a
        a.vy -= j * ny * inv_a
        b.vx += j * nx * inv_b
        b.vy += j * ny * inv_b
        if -rv > 4:
            if a.kind == "ball" or b.kind == "ball":
                disk = b.kind if a.kind == "ball" else a.kind
                events.add("touch", disk)
            else:
                events.add("disks", "")


def step(bodies: list[Body], events: SimEvents, h: float = DT) -> None:
    sub_h = h / SUB
    for _ in range(SUB):
        for b in bodies:
            sp = b.speed
            if sp > 0:
                # Coulomb-style friction plus light drag; never reverses direction.
                dec = (b.friction + P["linearDrag"] * sp) * sub_h
                k = max(0.0, sp - dec) / sp
                b.vx *= k
                b.vy *= k
            b.x += b.vx * sub_h
            b.y += b.vy * sub_h
        for i in range(len(bodies)):
            for j in range(i + 1, len(bodies)):
                _collide_bodies(bodies[i], bodies[j], events)
        for b in bodies:
            for seg in (WALLS if b.kind == "ball" else DISK_WALLS):
                _collide_wall(b, seg, events)


def check_goal(ball: Body) -> str | None:
    """Return the side that scored once the ball FULLY crosses a goal line."""
    if ball.x < -ball.r and G0 < ball.y < G1:
        return "B"
    if ball.x > L + ball.r and G0 < ball.y < G1:
        return "A"
    return None


def settled(bodies: list[Body]) -> bool:
    return all(b.speed < P["stopSpeed"] for b in bodies)


def positions(bodies: list[Body]) -> dict[str, list[float]]:
    return {b.kind: [round(b.x, 3), round(b.y, 3)] for b in bodies}


class Simulation:
    """Step-by-step simulation used by rooms (streamed) and the bot (offline)."""

    def __init__(self, pos: dict[str, tuple[float, float]], shots: dict[str, tuple[float, int] | None], h: float = DT):
        self.bodies = make_bodies(pos)
        launch(self.bodies, shots)
        self.events = SimEvents()
        self.h = h
        self.steps = 0
        self.max_steps = int(P["maxSimSeconds"] / h)
        self.done = False
        self.ball_path: list[list[float]] = [[round(self.ball.x, 2), round(self.ball.y, 2)]]

    @property
    def ball(self) -> Body:
        return self.bodies[2]

    def advance(self, n: int = 1) -> None:
        for _ in range(n):
            if self.done:
                return
            step(self.bodies, self.events, self.h)
            self.steps += 1
            if self.steps % 4 == 0:
                self.ball_path.append([round(self.ball.x, 2), round(self.ball.y, 2)])
            g = check_goal(self.ball)
            if g:
                self.events.goal = g
                self.events.goal_step = self.steps
                self.done = True
            elif settled(self.bodies) or self.steps >= self.max_steps:
                for b in self.bodies:
                    b.vx = b.vy = 0.0
                self.done = True
        if self.done:
            self.ball_path.append([round(self.ball.x, 2), round(self.ball.y, 2)])

    def run(self) -> "Simulation":
        while not self.done:
            self.advance(64)
        return self


def describe(events: SimEvents, shots: dict[str, tuple[float, int] | None]) -> dict:
    """Turn the contact log into a short human label for the result banner."""
    c = events.contacts
    touches = [d for k, d in c if k == "touch"]
    if events.goal:
        scorer = events.goal
        conceder = "B" if scorer == "A" else "A"
        last_touch_idx = max((i for i, (k, _) in enumerate(c) if k == "touch"), default=-1)
        last_toucher = c[last_touch_idx][1] if last_touch_idx >= 0 else None
        banked = any(k == "wall" for k, _ in c[last_touch_idx + 1 :])
        if last_toucher == conceder:
            kind = "own_goal"
        elif banked:
            kind = "bank"
        else:
            kind = "direct"
        return {"kind": kind, "scorer": scorer}
    if not any(shots.values()):
        return {"kind": "still"}
    if not touches:
        return {"kind": "disks" if any(k == "disks" for k, _ in c) else "miss"}
    # A block: the second distinct toucher redirected a ball the other side had hit,
    # or the disks met before the ball was reached.
    distinct = []
    for t in touches:
        if not distinct or distinct[-1] != t:
            distinct.append(t)
    if len(distinct) >= 2:
        return {"kind": "block", "by": "B" if distinct[0] == "A" else "A"}
    first_disk_contact = next((i for i, (k, _) in enumerate(c) if k in ("disks", "touch")), None)
    if first_disk_contact is not None and c[first_disk_contact][0] == "disks":
        return {"kind": "block", "by": "B" if touches[0] == "A" else "A"}
    if any(k == "wall" for k, _ in c):
        return {"kind": "bank_miss", "by": touches[0]}
    return {"kind": "miss", "by": touches[0]}
