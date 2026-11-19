import { FormEvent, useCallback, useEffect, useState } from "react";
import type { GameClient } from "@shared/client";
import { RinkCanvas } from "../components/RinkCanvas";
import { demoScene } from "@shared/demo";
import { tutorialDone } from "../App";
import { REPO_URL } from "../config";

export function Home({ client, onHowTo, reducedMotion }: { client: GameClient; onHowTo: () => void; reducedMotion: boolean }) {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const sceneFn = useCallback((t: number) => demoScene(t, reducedMotion), [reducedMotion]);
  const busy = client.status === "connecting" || client.status === "reconnecting";
  // Re-render once a second while connecting so the "waking up" hint can appear.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length === 4) void client.join(code);
  };

  return (
    <main className="home">
      <header className="home-head">
        <h1 className="wordmark">
          BLUFF <span className="amp">&amp;</span> <span className="bonk">BONK</span>
        </h1>
        <p className="tagline">Aim in secret. Shoot together.</p>
      </header>
      <div className="home-demo">
        <RinkCanvas orient="h" sceneFn={sceneFn} reducedMotion={reducedMotion} label="Demo: a bank shot off the boards into the far goal" />
      </div>
      <div className="home-actions">
        <button className="btn primary big" autoFocus onClick={() => client.practice(!tutorialDone())} disabled={busy}>
          Play practice
        </button>
        <div className="home-row">
          <button className="btn" onClick={() => client.create()} disabled={busy || client.offlineOnly}>
            Create room
          </button>
          {joining ? (
            <form className="join-form" onSubmit={submit}>
              <label htmlFor="code" className="sr-only">
                Room code
              </label>
              <input
                id="code"
                className="code-input"
                value={code}
                autoFocus
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={4}
                placeholder="CODE"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
              <button className="btn" type="submit" disabled={code.length !== 4 || busy}>
                Join
              </button>
            </form>
          ) : (
            <button className="btn" onClick={() => setJoining(true)} disabled={busy || client.offlineOnly}>
              Join room
            </button>
          )}
        </div>
        {client.offlineOnly && (
          <p className="offline-note">
            This web demo runs practice in your browser. Online rooms need the game server —{" "}
            <a href={REPO_URL + "#run-it-locally"}>run it yourself</a>.
          </p>
        )}
        <p className="status-line" aria-live="polite">
          {busy
            ? client.elapsedSince(client.connectingSince) > 4000
              ? "Waking up the game server — free hosting naps when idle, this can take up to a minute…"
              : "Connecting…"
            : "\u00a0"}
        </p>
        <button className="link" onClick={onHowTo}>
          How to play
        </button>
      </div>
    </main>
  );
}
