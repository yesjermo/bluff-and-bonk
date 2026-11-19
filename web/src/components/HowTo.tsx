import { useEffect, useRef } from "react";

export function HowTo({ onClose, onReplayTutorial }: { onClose: () => void; onReplayTutorial: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const close = () => onClose();
    d.addEventListener("close", close);
    return () => d.removeEventListener("close", close);
  }, [onClose]);
  return (
    <dialog ref={ref} className="howto" aria-labelledby="howto-title">
      <h2 id="howto-title">How to play</h2>
      <ol>
        <li>
          <b>Aim in secret.</b> Press anywhere on the rink and drag the way you want to shoot. The arrow always starts at your disk.
        </li>
        <li>
          <b>Pick power 1, 2 or 3.</b> Level 3 hits hardest, but you only get two per match. A charge is spent only when that shot launches.
        </li>
        <li>
          <b>Lock your shot</b> within 8 seconds. If time runs out, your latest aim fires. Never aimed? Your disk stays put.
        </li>
        <li>
          <b>Shoot together.</b> Both arrows are revealed, then both disks launch at once. Bank off the boards, block, or bluff.
        </li>
        <li>
          <b>First to two goals wins.</b> The ball must fully cross the goal line.
        </li>
      </ol>
      <p className="keys">
        Keyboard: <kbd>←</kbd> <kbd>→</kbd> aim (<kbd>Shift</kbd> for big steps) · <kbd>1</kbd>–<kbd>3</kbd> power · <kbd>Space</kbd> lock
      </p>
      <div className="howto-actions">
        <button className="btn" onClick={onReplayTutorial}>
          Replay tutorial
        </button>
        <button className="btn primary" autoFocus onClick={() => ref.current?.close()}>
          Got it
        </button>
      </div>
    </dialog>
  );
}
