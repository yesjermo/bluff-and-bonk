"""Shot tuning checks: a direct goal, a wall bank and a defensive block must be
intentional (they work) and repeatable (small aim errors give the same result)."""
import math

from app.physics import L, Simulation, describe


def run(pos, shots):
    sim = Simulation(pos, shots).run()
    return sim, describe(sim.events, shots)


def test_direct_goal_is_repeatable():
    for da in (-3, 0, 3):
        shots = {"A": (math.radians(da), 2)}
        sim, out = run({"A": (140, 50), "B": (60, 20), "ball": (160, 50)}, shots)
        assert sim.events.goal == "A"
        assert out["kind"] == "direct"


def test_power_one_is_short_range():
    sim, _ = run({"A": (20, 20), "B": (180, 80), "ball": (100, 90)}, {"A": (0.0, 1)})
    travelled = sim.bodies[0].x - 20
    assert 35 < travelled < 75


def test_bank_off_the_boards():
    ball = (140, 26)
    target = (L + 6, -50)  # goal mouth mirrored across the top board
    d = (ball[0] - target[0], ball[1] - target[1])
    n = math.hypot(*d)
    d = (d[0] / n, d[1] / n)
    disk = (ball[0] + d[0] * 16, ball[1] + d[1] * 16)
    aim = math.atan2(-d[1], -d[0])
    for power in (2, 3):
        for da in (-4, 0, 4):
            shots = {"A": (aim + math.radians(da), power)}
            sim, out = run({"A": disk, "B": (60, 80), "ball": ball}, shots)
            assert sim.events.goal == "A", (power, da)
            assert out["kind"] == "bank"
            assert ("wall", "") in sim.events.contacts


def test_defensive_block():
    start = {"A": (110, 50), "B": (178, 88), "ball": (126, 50)}
    # Undefended, A's power-3 shot goes in.
    sim, _ = run(start, {"A": (0.0, 3), "B": None})
    assert sim.events.goal == "A"
    # A defender stepping across at power 2 stops it over a wide window of angles.
    for deg in (-102, -96, -90, -78, -72):
        shots = {"A": (0.0, 3), "B": (math.radians(deg), 2)}
        sim, out = run(start, shots)
        assert sim.events.goal is None, deg
        assert out["kind"] == "block" and out["by"] == "B"


def test_goal_requires_full_crossing():
    # Ball resting half over the line is not a goal.
    sim, _ = run({"A": (60, 20), "B": (60, 80), "ball": (L + 1, 50)}, {})
    assert sim.events.goal is None


def test_simulation_is_deterministic():
    pos = {"A": (42, 50), "B": (158, 50), "ball": (100, 50)}
    shots = {"A": (0.3, 3), "B": (math.pi - 0.2, 2)}
    a = Simulation(pos, shots).run()
    b = Simulation(pos, shots).run()
    assert [(x.x, x.y) for x in a.bodies] == [(x.x, x.y) for x in b.bodies]


def test_disks_cannot_enter_the_net_but_the_ball_can():
    # A disk fired straight at its own goal stops at the line instead of parking inside.
    sim, _ = run({"A": (30, 50), "B": (150, 20), "ball": (150, 80)}, {"A": (3.14159, 3)})
    assert sim.bodies[0].x >= 7 - 1e-6
    sim, _ = run({"A": (60, 50), "B": (150, 20), "ball": (40, 50)}, {"A": (3.14159, 2)})
    assert sim.events.goal == "B"  # the ball still goes in (an own goal)
