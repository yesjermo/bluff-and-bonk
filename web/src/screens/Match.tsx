import { useEffect, useRef, useState } from "react";
import type { GameClient } from "@shared/client";
import { C, POWER_INFO, Power, SIDE_NAME, Side, other } from "@shared/protocol";
import { stripMessage, timerInfo } from "@shared/status";
import { forwardAngle, makeView, rotateAngleOnScreen } from "@shared/transform";
import { RinkCanvas } from "../components/RinkCanvas";
import { isMuted, setMuted, sfx } from "../sound";
import { markTutorialDone } from "../App";

function useOrientation(): "h" | "v" {
  const get = (): "h" | "v" => (window.innerWidth < 760 && window.innerHeight > window.innerWidth ? "v" : "h");
  const [o, setO] = useState(get);
  useEffect(() => {
    const on = () => setO(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return o;
}

/** Re-render at ~10 fps while time-based UI (timer, countdown) is visible. */
function useTicker(active: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => set((x) => x + 1), 100);
    return () => clearInterval(id);
  }, [active]);
}

const isTouch = () => matchMedia("(pointer: coarse)").matches;

export function Match({
  client,
  onLeave,
  onHowTo,
  reducedMotion,
}: {
  client: GameClient;
  onLeave: () => void;
  onHowTo: () => void;
  reducedMotion: boolean;
}) {
  const s = client.state!;
  const you = client.side!;
  const opp = other(you);
  const orient = useOrientation();
  const [muted, setMutedState] = useState(isMuted());
  const [powerTouched, setPowerTouched] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const turn = s.turn;
  useTicker(s.phase === "planning" || s.phase === "countdown");

  // ---- sound + one-shot effects on transitions
  const prev = useRef({ phase: s.phase, locked: false, resultId: "", oppLocked: false, sec: 99 });
  useEffect(() => {
    const p = prev.current;
    const locked = client.locked;
    const oppLocked = !!turn?.locked[opp];
    if (locked && !p.locked) sfx.lock();
    if (oppLocked && !p.oppLocked && !locked) sfx.power();
    if (s.phase === "reveal" && p.phase !== "reveal") sfx.reveal();
    const r = client.result;
    if (r && r.turnId !== p.resultId) {
      if (r.goal) sfx.goal();
      if (r.tutorial) markTutorialDone();
    }
    const left = client.timeLeft();
    const sec = left == null ? 99 : Math.ceil(left / 1000);
    if (s.phase === "planning" && !locked && sec <= 3 && sec < p.sec && sec > 0) sfx.tick();
    prev.current = { phase: s.phase, locked, resultId: r?.turnId ?? p.resultId, oppLocked, sec };
  });

  // ---- keyboard: arrows aim, 1-3 power, Space locks
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.querySelector("dialog[open]")) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        if (!client.canPlan) return;
        const view = makeView(orient, you, 100, 100);
        const base = client.aim ?? forwardAngle(you);
        const step = ((e.shiftKey ? 12 : 3) * Math.PI) / 180;
        const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
        client.setAim(client.aim == null ? base : rotateAngleOnScreen(view, base, dir * step));
      } else if (e.key === "1" || e.key === "2" || e.key === "3") {
        choosePower(Number(e.key) as Power);
      } else if (e.key === " " || e.code === "Space") {
        const el = e.target as HTMLElement;
        // Space always locks, except on buttons outside the shot controls (mute, leave…).
        if (el?.tagName === "BUTTON" && !el.closest(".controls")) return;
        e.preventDefault();
        client.lock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const choosePower = (p: Power) => {
    if (!client.canPlan || !client.powerAvailable(p)) return;
    client.setPower(p);
    setPowerTouched(true);
    sfx.power();
  };

  const msg = stripMessage(client, powerTouched, isTouch());
  const timer = timerInfo(client);
  const planning = s.phase === "planning";
  const canPlan = client.canPlan;
  const locked = client.locked;
  const tutorial = !!turn?.tutorial;
  const ended = s.phase === "ended";
  const oppInfo = s.players[opp];

  const playerCard = (side: Side) => {
    const isYou = side === you;
    const lockedNow = !!turn?.locked[side];
    const status = !planning ? " " : lockedNow ? "Locked" : "Planning";
    const charges = s.charges[side];
    const p = s.players[side];
    return (
      <div className={`pcard side-${side} ${isYou ? "you" : "them"}`}>
        <span className={`chip-shape shape-${side}`} aria-hidden />
        <div className="pcard-text">
          <span className="pname">{isYou ? "YOU" : p?.bot ? "BOT" : "OPPONENT"}</span>
          <span className={`pstatus ${lockedNow && planning ? "is-locked" : ""}`}>
            {p && !p.connected ? "Offline" : status}
            {lockedNow && planning ? " ●" : ""}
          </span>
        </div>
        <span className="charges" aria-label={`${isYou ? "Your" : "Opponent"} full-power charges: ${charges} of ${C.rules.fullPowerCharges}`}>
          {Array.from({ length: C.rules.fullPowerCharges }, (_, i) => (
            <i key={i} className={i < charges ? "pip on" : "pip"} />
          ))}
        </span>
      </div>
    );
  };

  const lockLabel = locked ? "Shot locked" : client.aim == null ? "Aim first" : "Lock shot";

  return (
    <main className={`match orient-${orient}`}>
      <header className="scoreboard" aria-label="Scoreboard">
        {playerCard(you)}
        <div className="center-score">
          <div className="score" aria-label={`Score: you ${s.score[you]}, opponent ${s.score[opp]}`}>
            <span className={`n side-${you}`} key={`y${s.score[you]}`}>
              {s.score[you]}
            </span>
            <span className={`timer ${timer.warn ? "warn" : ""}`} role="timer" aria-label={`${timer.sub} ${timer.label}`}>
              <b>{timer.label}</b>
              <small>
                {timer.warn ? "⚠ " : ""}
                {timer.sub}
              </small>
              <span className="tbar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, timer.fraction))})` }} />
            </span>
            <span className={`n side-${opp}`} key={`o${s.score[opp]}`}>
              {s.score[opp]}
            </span>
          </div>
        </div>
        {playerCard(opp)}
        <div className={`sb-tools ${menuOpen ? "open" : ""}`} id="match-menu">
          <button className="icon-btn" onClick={() => setMutedState((setMuted(!muted), !muted))} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
              {muted ? (
                <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
              )}
            </svg>
          </button>
          <button className="icon-btn" onClick={onHowTo} aria-label="How to play">
            ?
          </button>
          <button className="icon-btn" onClick={onLeave} aria-label="Leave match">
            ✕
          </button>
        </div>
      </header>
      {orient === "v" && (
        <button className="icon-btn menu-btn" aria-expanded={menuOpen} aria-controls="match-menu" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}

      <section className="arena" aria-label="Rink">
        <RinkCanvas
          client={client}
          orient={orient}
          reducedMotion={reducedMotion}
          label={`Rink. You are ${SIDE_NAME[you]}, ${you === "A" ? "triangle" : "square"} marking, defending the ${orient === "h" ? "left" : "bottom"} goal.`}
        />
        {ended && (
          <div className="end-card" role="dialog" aria-labelledby="end-title">
            <p className="eyebrow">{s.endReason === "forfeit" ? "Forfeit" : "Full time"}</p>
            <h2 id="end-title" className={`end-title side-${s.winner}`}>
              {s.winner === you ? "YOU WIN" : "YOU LOSE"}
            </h2>
            <p className="end-score">
              {s.score[you]} – {s.score[opp]}
            </p>
            {s.endReason !== "forfeit" && (
              <button className="btn primary big" autoFocus onClick={() => client.rematch()} disabled={!!s.players[you]?.rematch}>
                {s.players[you]?.rematch ? "Waiting for opponent…" : "Rematch"}
              </button>
            )}
            {oppInfo?.rematch && !s.players[you]?.rematch && <p className="end-note">Opponent wants a rematch</p>}
            <button className="btn ghost" onClick={onLeave}>
              Leave
            </button>
          </div>
        )}
      </section>

      <p className={`strip tone-${msg.tone}`} aria-live="polite">
        {msg.text}
      </p>

      <footer className={`controls ${tutorial && client.aim != null && !powerTouched ? "teach-power" : ""}`}>
        <div className="powers" role="radiogroup" aria-label="Shot power">
          {([1, 2, 3] as Power[]).map((p) => {
            const available = client.powerAvailable(p);
            const charges = s.charges[you];
            return (
              <button
                key={p}
                role="radio"
                aria-checked={client.power === p}
                className={`power p${p} ${client.power === p ? "sel" : ""}`}
                disabled={!canPlan || !available}
                onClick={() => choosePower(p)}
                aria-label={`Power ${p}, ${POWER_INFO[p].label}. ${p === 3 ? (tutorial ? "Free on the practice shot" : `${charges} of 2 charges left`) : "Free"}`}
              >
                <span className="pw-num">{p}</span>
                <span className="pw-bars" aria-hidden>
                  {[1, 2, 3].map((b) => (
                    <i key={b} className={b <= p ? "on" : ""} />
                  ))}
                </span>
                <span className="pw-label">{POWER_INFO[p].label}</span>
                <span className="pw-cost">
                  {p === 3 ? (
                    <>
                      <span className="charges inline" aria-hidden>
                        {Array.from({ length: C.rules.fullPowerCharges }, (_, i) => (
                          <i key={i} className={i < charges ? "pip on" : "pip"} />
                        ))}
                      </span>
                      {tutorial ? "Free now" : charges > 0 ? "1 charge" : "None left"}
                    </>
                  ) : (
                    "Free"
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <button
          className={`btn lock ${locked ? "is-locked" : ""} ${canPlan && client.aim != null ? "ready" : ""}`}
          disabled={!canPlan || client.aim == null}
          onClick={() => client.lock()}
          aria-pressed={locked}
        >
          <span className="lock-icon" aria-hidden>
            {locked ? "✓" : "⏎"}
          </span>
          {lockLabel}
        </button>
      </footer>
    </main>
  );
}
