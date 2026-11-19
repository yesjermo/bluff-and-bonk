"""Practice opponent.

The bot is handed ONLY the public board (positions, its own side, its own
remaining charges and the score). It is called at the start of a turn, before
any human input for that turn exists, so it structurally cannot read the
human's private aim.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass

from .physics import DT, L, W, G0, G1, Simulation


@dataclass(frozen=True)
class PublicBoard:
    positions: dict[str, tuple[float, float]]
    side: str
    charges: int
    score: dict[str, int]


def _evaluate(board: PublicBoard, angle: float, power: int) -> float:
    me = board.side
    opp = "A" if me == "B" else "B"
    sim = Simulation(board.positions, {me: (angle, power)}, h=DT * 2)
    sim.max_steps = int(3.5 / sim.h)
    sim.run()
    if sim.events.goal == me:
        return 1000 - (25 if power == 3 else 0)
    if sim.events.goal == opp:
        return -2000
    ball = sim.ball
    toward = -1 if me == "B" else 1  # +x for A, -x for B
    attack_x = L if me == "A" else 0
    own_x = 0 if me == "A" else L
    bx0 = board.positions["ball"][0]
    progress = (ball.x - bx0) * toward
    score = progress * 1.2
    # Ball near the opponent goal mouth is good, near ours is bad.
    centered = 1 - min(1.0, abs(ball.y - W / 2) / (W / 2))
    score += max(0.0, 60 - abs(ball.x - attack_x)) * 0.8 * centered
    score -= max(0.0, 60 - abs(ball.x - own_x)) * 1.5 * centered
    # Keep our disk goal-side of the ball (between ball and our goal).
    my = sim.bodies[0 if me == "A" else 1]
    if (my.x - ball.x) * toward < 0:
        score += 12
    if G0 < my.y < G1 and abs(my.x - own_x) < 45:
        score += 8
    if power == 3:
        score -= 18
    return score


def choose_shot(board: PublicBoard, rng: random.Random | None = None) -> tuple[float, int] | None:
    rng = rng or random.Random()
    powers = [1, 2] + ([3] if board.charges > 0 else [])
    results: list[tuple[float, float, int]] = []
    steps = 40
    for i in range(steps):
        a = (i / steps) * 2 * math.pi
        for p in powers:
            results.append((_evaluate(board, a, p), a, p))
    results.sort(reverse=True)
    top = results[:5]
    # A little human imprecision: pick among the best few, jitter the angle.
    weights = [math.exp((s - top[0][0]) / 40) for s, _, _ in top]
    _, angle, power = rng.choices(top, weights=weights, k=1)[0]
    angle += rng.gauss(0, math.radians(2.2))
    return (angle, power)
