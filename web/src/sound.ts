// Tiny synthesized cues; everything they signal is also shown on screen.
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem("impulse.muted") === "1";
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("impulse.muted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function tone(freq: number, ms: number, type: OscillatorType = "square", gain = 0.05, slide = 0) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + ms / 1000);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  } catch {
    /* audio unavailable */
  }
}

export const sfx = {
  lock: () => tone(880, 70, "square", 0.04, 1.5),
  reveal: () => tone(320, 180, "sawtooth", 0.03, 2.2),
  tick: () => tone(1200, 40, "sine", 0.03),
  goal: () => {
    tone(523, 140, "triangle", 0.07);
    setTimeout(() => tone(784, 220, "triangle", 0.07), 120);
  },
  power: () => tone(600, 30, "sine", 0.025),
};
