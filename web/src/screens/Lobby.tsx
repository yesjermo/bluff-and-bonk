import { useEffect, useState } from "react";
import type { GameClient } from "@shared/client";
import { SIDE_NAME, Side, other } from "@shared/protocol";
import { inviteLink } from "../config";

export function Lobby({ client, onLeave }: { client: GameClient; onLeave: () => void }) {
  const s = client.state!;
  const you = client.side!;
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  // Being on this screen means ready; the server starts a countdown when both are.
  useEffect(() => {
    if (client.synced && !s.players[you]?.ready) client.ready();
  }, [client.synced, s.players[you]?.ready]);

  const copy = async (what: "code" | "link") => {
    const text = what === "code" ? s.room : inviteLink(s.room);
    try {
      if (what === "link" && navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "BLUFF & BONK", text: "Play me in BLUFF & BONK", url: text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* user cancelled share */
    }
  };

  const slot = (side: Side) => {
    const p = s.players[side];
    const isYou = side === you;
    return (
      <li className={`slot side-${side}`} key={side}>
        <span className={`chip-shape shape-${side}`} aria-hidden />
        <span className="slot-name">{isYou ? "YOU" : p ? "Opponent" : "Waiting for opponent"}</span>
        <span className="slot-state">
          {!p ? <span className="dots">Open slot</span> : !p.connected ? "Reconnecting…" : p.ready ? "Ready" : "Joining…"}
        </span>
        <span className="slot-color">{SIDE_NAME[side]}</span>
      </li>
    );
  };

  const both = s.players.A && s.players.B;
  return (
    <main className="lobby">
      <button className="btn ghost small back" onClick={onLeave}>
        ← Leave
      </button>
      <p className="eyebrow">Private room</p>
      <button className="room-code" onClick={() => copy("code")} aria-label={`Room code ${s.room.split("").join(" ")}. Click to copy.`}>
        {s.room}
      </button>
      <div className="lobby-actions">
        <button className="btn" onClick={() => copy("code")}>
          {copied === "code" ? "Copied ✓" : "Copy code"}
        </button>
        <button className="btn primary" onClick={() => copy("link")}>
          {copied === "link" ? "Link copied ✓" : "Copy invite link"}
        </button>
      </div>
      <ul className="slots">{[you, other(you)].map(slot)}</ul>
      <p className="lobby-status" aria-live="polite">
        {client.status !== "open" ? "Reconnecting to the server…" : both ? "Both players here — starting…" : "Send the code or link. The match starts when your opponent joins."}
      </p>
    </main>
  );
}
