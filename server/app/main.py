"""BLUFF & BONK server: room registry, HTTP endpoints and the WebSocket protocol."""
from __future__ import annotations

import asyncio
import os
import re
import secrets
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .room import Conn, Room

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_RE = re.compile(r"^[A-Z0-9]{4}$")
ROOM_IDLE_SECONDS = float(os.getenv("ROOM_IDLE_SECONDS", "600"))
EXPIRED_MEMORY_SECONDS = 24 * 3600

rooms: dict[str, Room] = {}
expired: dict[str, float] = {}  # code -> when it expired, so we can say "expired" not "invalid"


def new_code(prefix: str = "") -> str:
    while True:
        code = prefix + "".join(secrets.choice(CODE_ALPHABET) for _ in range(4 - len(prefix)))
        if code not in rooms and code not in expired:
            return code


async def janitor() -> None:
    while True:
        await asyncio.sleep(2)
        t = time.monotonic()
        for code, room in list(rooms.items()):
            room.tick()
            idle = t - room.last_activity
            if room.humans_connected() == 0 and (idle > ROOM_IDLE_SECONDS or (room.practice and idle > 60)):
                room.close()
                del rooms[code]
                expired[code] = time.time()
        for code, when in list(expired.items()):
            if time.time() - when > EXPIRED_MEMORY_SECONDS:
                del expired[code]


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(janitor())
    yield
    task.cancel()


app = FastAPI(title="BLUFF & BONK", lifespan=lifespan)
origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health() -> dict:
    return {"ok": True, "rooms": len(rooms)}


@app.get("/api/rooms/{code}")
def room_status(code: str) -> dict:
    code = code.upper()
    return {"code": code, "status": room_lookup_status(code)}


def room_lookup_status(code: str) -> str:
    if not CODE_RE.match(code):
        return "invalid"
    room = rooms.get(code)
    if room is None:
        return "expired" if code in expired else "invalid"
    if room.practice:
        return "invalid"
    if room.is_full():
        return "full"
    return "open"


ERRORS = {
    "invalid": "That room code doesn't exist. Check the code or create a new room.",
    "expired": "That room has expired. Create a new room and send a fresh invite.",
    "full": "That room already has two players. Ask for a new invite or create your own room.",
}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    conn = Conn(ws)
    room: Room | None = None
    side: str | None = None
    try:
        while True:
            msg = await ws.receive_json()
            if not isinstance(msg, dict):
                continue
            kind = msg.get("t")
            if room is None:
                room, side = attach(conn, msg)
                if room is None:
                    continue
                room.send_state(side)
                if room.practice:
                    room.players[side].ready = True
                    room._maybe_start()
                continue
            if kind == "leave":
                break
            assert side is not None
            room.handle(side, msg)
    except (WebSocketDisconnect, RuntimeError, ValueError):
        pass
    finally:
        if room is not None:
            room.detach(conn)
        conn.close()


def attach(conn: Conn, msg: dict) -> tuple[Room | None, str | None]:
    kind = msg.get("t")
    if kind == "create":
        code = new_code()
        room = rooms[code] = Room(code)
        p = room.add_player(conn)
        return room, p.side if p else None
    if kind == "practice":
        code = new_code("P")
        room = rooms[code] = Room(code, practice=True, tutorial=bool(msg.get("tutorial")))
        p = room.add_player(conn)
        return room, p.side if p else None
    if kind == "join":
        code = str(msg.get("room", "")).strip().upper()
        token = msg.get("token")
        room = rooms.get(code)
        if room and isinstance(token, str) and token:
            p = room.reattach(token, conn)
            if p:
                return room, p.side
        status = room_lookup_status(code)
        if status != "open":
            conn.send({"t": "error", "code": status, "room": code, "message": ERRORS[status]})
            return None, None
        assert room is not None
        p = room.add_player(conn)
        if p is None:
            conn.send({"t": "error", "code": "full", "room": code, "message": ERRORS["full"]})
            return None, None
        room.broadcast_state()
        return room, p.side
    conn.send({"t": "error", "code": "protocol", "message": "Send create, join or practice first."})
    return None, None
