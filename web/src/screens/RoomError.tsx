import { FormEvent, useState } from "react";
import type { GameClient } from "@shared/client";

const TITLES: Record<string, string> = {
  invalid: "Room not found",
  expired: "Room expired",
  full: "Room is full",
  protocol: "Something went wrong",
};

export function RoomError({ client, onHome }: { client: GameClient; onHome: () => void }) {
  const err = client.error!;
  const [code, setCode] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === 4) void client.join(code);
  };
  return (
    <main className="error-screen" role="alert">
      <p className="eyebrow">{err.room ? `Room ${err.room}` : "Room"}</p>
      <h1 className="error-title">{TITLES[err.code] ?? "Can't join"}</h1>
      <p className="error-msg">{err.message}</p>
      <div className="error-actions">
        {err.code === "invalid" && (
          <form className="join-form" onSubmit={submit}>
            <label htmlFor="retry-code" className="sr-only">
              Room code
            </label>
            <input
              id="retry-code"
              className="code-input"
              autoFocus
              maxLength={4}
              placeholder="CODE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
            <button className="btn" disabled={code.length !== 4}>
              Try again
            </button>
          </form>
        )}
        <button className="btn primary" onClick={() => client.create()}>
          {err.code === "expired" ? "Create a new room" : "Create room"}
        </button>
        <button className="btn" onClick={() => client.practice(false)}>
          Play practice
        </button>
        <button className="link" onClick={onHome}>
          Back to start
        </button>
      </div>
    </main>
  );
}
