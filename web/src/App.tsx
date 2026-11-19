import { useEffect, useReducer, useState } from "react";
import { GameClient, KeyValueStore } from "@shared/client";
import { BASE, OFFLINE, WS_URL } from "./config";
import { localPracticeSocket } from "@shared/localRoom";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Match } from "./screens/Match";
import { RoomError } from "./screens/RoomError";
import { HowTo } from "./components/HowTo";

// Seat tokens live per tab (sessionStorage) so two tabs can be two players and a
// refresh rejoins the same seat; preferences live in localStorage.
const area = (k: string) => (k.startsWith("bonk.token.") ? sessionStorage : localStorage);
const store: KeyValueStore = {
  get: (k) => {
    try {
      return area(k).getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      area(k).setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

// One client per tab, created outside React so StrictMode can't double it.
const sharedClient = new GameClient(WS_URL, store, OFFLINE ? localPracticeSocket : undefined);
// ?wire=1 records every raw server message in window.__wire for inspection.
if (new URLSearchParams(location.search).has("wire")) {
  const g = window as unknown as { __wire: string[]; __client: GameClient };
  g.__wire = [];
  g.__client = sharedClient;
  sharedClient.onRaw = (raw) => g.__wire.push(raw);
}

export const tutorialDone = () => store.get("bonk.tutorialDone") === "1";
export const markTutorialDone = () => store.set("bonk.tutorialDone", "1");

function useReducedMotion(): boolean {
  const q = "(prefers-reduced-motion: reduce)";
  const [r, setR] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

const roomFromPath = () =>
  /^\/r\/([A-Za-z0-9]{4})\/?$/.exec(location.pathname.slice(BASE.length))?.[1]?.toUpperCase() ?? null;

export default function App() {
  const client = sharedClient;
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [howTo, setHowTo] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => client.subscribe(force), [client]);

  // Invite links (/r/CODE) go straight into the room.
  useEffect(() => {
    const code = roomFromPath();
    if (code) void client.join(code);
    const onVis = () => document.visibilityState === "visible" && client.resume();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onVis);
    };
  }, [client]);

  // Keep the URL shareable / refresh-safe while in a private room.
  const s = client.state;
  useEffect(() => {
    if (!s) return; // connecting or erroring: keep the invite path as-is
    const want = BASE + (s.practice ? "/" : `/r/${s.room}`);
    if (location.pathname !== want) history.replaceState(null, "", want);
  }, [s?.room, s?.practice, client.error]);

  const leave = () => {
    client.leave();
    history.replaceState(null, "", BASE + "/");
  };

  let screen;
  if (client.error) screen = <RoomError client={client} onHome={leave} />;
  else if (!s) screen = <Home client={client} onHowTo={() => setHowTo(true)} reducedMotion={reduced} />;
  else if (s.phase === "lobby" && !s.practice) screen = <Lobby client={client} onLeave={leave} />;
  else screen = <Match client={client} onLeave={leave} onHowTo={() => setHowTo(true)} reducedMotion={reduced} />;

  return (
    <>
      {screen}
      {howTo && (
        <HowTo
          onClose={() => setHowTo(false)}
          onReplayTutorial={() => {
            setHowTo(false);
            client.practice(true);
          }}
        />
      )}
    </>
  );
}
