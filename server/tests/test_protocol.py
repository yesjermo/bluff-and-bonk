"""End-to-end protocol tests against a real uvicorn server (timers sped up 5x)."""
import asyncio
import json
import os
import socket
import threading
import time

os.environ["BONK_TIME_SCALE"] = "0.2"

import pytest
import uvicorn
import websockets

from app import main
from app.physics import L


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture(scope="module")
def url():
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=port, log_level="warning"))
    th = threading.Thread(target=server.run, daemon=True)
    th.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    yield f"ws://127.0.0.1:{port}/ws"
    server.should_exit = True


class Client:
    def __init__(self, ws):
        self.ws = ws
        self.log: list[dict] = []
        self.raw: list[str] = []

    @classmethod
    async def open(cls, url, first):
        ws = await websockets.connect(url)
        c = cls(ws)
        await c.send(first)
        return c

    async def send(self, msg):
        await self.ws.send(json.dumps(msg))

    async def until(self, pred, timeout=8.0):
        end = time.monotonic() + timeout
        while True:
            left = end - time.monotonic()
            if left <= 0:
                raise AssertionError(f"timed out; last={self.log[-1] if self.log else None}")
            raw = await asyncio.wait_for(self.ws.recv(), timeout=left)
            self.raw.append(raw)
            m = json.loads(raw)
            self.log.append(m)
            if pred(m):
                return m

    async def state(self, pred=lambda s: True, timeout=8.0):
        return await self.until(lambda m: m["t"] == "state" and pred(m), timeout)


def planning(s):
    return s["phase"] == "planning"


async def pair(url):
    a = await Client.open(url, {"t": "create"})
    sa = await a.state()
    code = sa["room"]
    b = await Client.open(url, {"t": "join", "room": code})
    await b.state()
    await a.send({"t": "ready"})
    await b.send({"t": "ready"})
    sa = await a.state(planning)
    sb = await b.state(planning)
    return a, b, code, sa, sb


def run(coro):
    return asyncio.run(coro)


def test_room_errors(url):
    async def go():
        c = await Client.open(url, {"t": "join", "room": "ZZZZ"})
        m = await c.until(lambda m: m["t"] == "error")
        assert m["code"] == "invalid"
        a, b, code, *_ = await pair(url)
        c2 = await Client.open(url, {"t": "join", "room": code})
        m = await c2.until(lambda m: m["t"] == "error")
        assert m["code"] == "full"
        main.expired["QQQQ"] = time.time()
        c3 = await Client.open(url, {"t": "join", "room": "QQQQ"})
        m = await c3.until(lambda m: m["t"] == "error")
        assert m["code"] == "expired"

    run(go())


def test_private_aim_never_reaches_opponent(url):
    async def go():
        a, b, code, sa, sb = await pair(url)
        tid = sa["turn"]["id"]
        secret = 1.23456
        await a.send({"t": "aim", "turnId": tid, "angle": secret, "power": 3})
        await a.send({"t": "lock", "turnId": tid, "angle": secret, "power": 3})
        await b.state(lambda s: s["turn"]["locked"]["A"])
        before = len(b.raw)
        await b.send({"t": "lock", "turnId": tid, "angle": 3.0, "power": 1})
        await b.until(lambda m: m["t"] == "reveal")
        pre_reveal = b.raw[: len(b.raw) - 1]
        assert pre_reveal, "B received messages"
        for raw in pre_reveal:
            assert "1.23456" not in raw
            m = json.loads(raw)
            if m["t"] == "state" and m["turn"]:
                assert m["turn"]["shots"] is None
                assert m["you"]["side"] == "B"
        reveal = json.loads(b.raw[-1])
        assert reveal["shots"]["A"]["angle"] == pytest.approx(secret, abs=1e-4)
        assert before > 0

    run(go())


def test_duplicate_and_simultaneous_locks_resolve_once(url):
    async def go():
        a, b, code, sa, _ = await pair(url)
        room = main.rooms[code]
        tid = sa["turn"]["id"]
        lock_a = {"t": "lock", "turnId": tid, "angle": 0.0, "power": 3}
        lock_b = {"t": "lock", "turnId": tid, "angle": 3.14, "power": 3}
        await asyncio.gather(*[a.send(lock_a) for _ in range(5)], *[b.send(lock_b) for _ in range(5)])
        await a.send({"t": "aim", "turnId": tid, "angle": 1.0, "power": 1})  # after lock: ignored
        res = await a.until(lambda m: m["t"] == "result")
        await a.state(planning)
        # Replaying the old turn's lock is stale.
        await a.send(lock_a)
        ign = await a.until(lambda m: m["t"] == "ignored")
        assert ign["reason"] == "stale_turn"
        reveals = [m for m in a.log if m["t"] == "reveal"]
        results = [m for m in a.log if m["t"] == "result"]
        assert len(reveals) == 1 and len(results) == 1
        assert [e["turnId"] for e in room.log].count(tid) == 1
        assert room.charges == {"A": 1, "B": 1}
        assert reveals[0]["shots"]["A"]["angle"] == 0.0
        assert sum(res["score"].values()) <= 1

    run(go())


def test_timer_expiry_uses_latest_aim_and_still_player(url):
    async def go():
        a, b, code, sa, _ = await pair(url)
        room = main.rooms[code]
        tid = sa["turn"]["id"]
        await a.send({"t": "aim", "turnId": tid, "angle": 0.5, "power": 1})
        await a.send({"t": "aim", "turnId": tid, "angle": 0.7, "power": 3})
        rev = await a.until(lambda m: m["t"] == "reveal", timeout=6)
        assert rev["shots"]["A"] == {"angle": 0.7, "power": 3}
        assert rev["shots"]["B"] is None  # never aimed: stays still
        await a.until(lambda m: m["t"] == "result")
        assert room.charges["A"] == 1 and room.charges["B"] == 2

    run(go())


def test_no_charges_rejects_full_power(url):
    async def go():
        a, b, code, sa, _ = await pair(url)
        room = main.rooms[code]
        room.charges["A"] = 0
        tid = sa["turn"]["id"]
        await a.send({"t": "lock", "turnId": tid, "angle": 0.0, "power": 3})
        ign = await a.until(lambda m: m["t"] == "ignored")
        assert ign["reason"] == "no_charges"

    run(go())


def test_reconnect_keeps_lock_and_state(url):
    async def go():
        a, b, code, sa, _ = await pair(url)
        token = sa["you"]["token"]
        tid = sa["turn"]["id"]
        await a.send({"t": "lock", "turnId": tid, "angle": 0.25, "power": 2})
        await a.state(lambda s: s["you"]["locked"])
        await a.ws.close()
        st = await b.state(lambda s: not s["players"]["A"]["connected"])
        assert st["turn"]["locked"]["A"] is True
        a2 = await Client.open(url, {"t": "join", "room": code, "token": token})
        s2 = await a2.state()
        if s2["phase"] == "planning" and s2["turn"]["id"] == tid:
            assert s2["you"]["locked"] is True
            assert s2["you"]["shot"] == {"angle": 0.25, "power": 2}
        rev = await a2.until(lambda m: m["t"] == "reveal", timeout=6)
        assert rev["shots"]["A"] == {"angle": 0.25, "power": 2}

    run(go())


def test_full_match_and_rematch(url):
    async def go():
        a, b, code, sa, _ = await pair(url)
        room = main.rooms[code]
        for goal in (1, 2):
            s = sa if goal == 1 else await a.state(planning)
            room.positions = {"A": (150, 50), "B": (60, 20), "ball": (168, 50)}
            await a.send({"t": "lock", "turnId": s["turn"]["id"], "angle": 0.0, "power": 2})
            await b.send({"t": "lock", "turnId": s["turn"]["id"], "angle": 1.57, "power": 1})
            res = await a.until(lambda m: m["t"] == "result")
            assert res["goal"] == "A" and res["score"]["A"] == goal
        end = await b.state(lambda s: s["phase"] == "ended")
        assert end["winner"] == "A" and end["score"] == {"A": 2, "B": 0}
        assert len([m for m in a.log if m["t"] == "result"]) == 2
        await a.send({"t": "rematch"})
        await b.send({"t": "rematch"})
        s = await a.state(planning)
        assert s["score"] == {"A": 0, "B": 0} and s["matchNo"] == 2
        assert s["charges"] == {"A": 2, "B": 2}

    run(go())


def test_practice_tutorial_then_bot(url):
    async def go():
        c = await Client.open(url, {"t": "practice", "tutorial": True})
        s = await c.state(planning)
        assert s["turn"]["tutorial"] is True and s["turn"]["deadlineIn"] is None
        await c.send({"t": "lock", "turnId": s["turn"]["id"], "angle": -0.2, "power": 2})
        res = await c.until(lambda m: m["t"] == "result")
        assert res["tutorial"] and not res["counted"] and res["score"] == {"A": 0, "B": 0}
        s = await c.state(lambda s: planning(s) and not s["turn"]["tutorial"])
        assert s["turn"]["deadlineIn"] is not None
        # The bot commits on its own using public state.
        s = await c.state(lambda s: s["turn"]["locked"]["B"], timeout=6)
        assert s["you"]["locked"] is False

    run(go())
