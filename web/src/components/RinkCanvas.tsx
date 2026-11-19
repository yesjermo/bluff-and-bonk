import { useEffect, useRef } from "react";
import type { GameClient } from "@shared/client";
import { drawScene, Scene } from "@shared/render";
import { buildScene } from "@shared/scene";
import { arenaAspect, dragToWorldAngle, makeView, Orientation, View } from "@shared/transform";
import { canvasPainter } from "../painter";

const DRAG_THRESHOLD = 8; // px; a tap below this keeps the previous aim

interface Props {
  client?: GameClient;
  orient: Orientation;
  /** Optional scene source for non-live rinks (the entry-screen demo). */
  sceneFn?: (t: number) => Scene;
  reducedMotion: boolean;
  label: string;
}

export function RinkCanvas({ client, orient, sceneFn, reducedMotion, label }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const dragRef = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const aspect = arenaAspect(orient);
      let w = r.width;
      let h = w / aspect;
      if (h > r.height) {
        h = r.height;
        w = h * aspect;
      }
      cssW = Math.floor(w);
      cssH = Math.floor(h);
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    const frame = (t: number) => {
      const side = client?.side ?? "A";
      const view = makeView(orient, side, cssW, cssH);
      viewRef.current = view;
      const scene = sceneFn ? sceneFn(t) : client ? buildScene(client, t, reducedMotion) : null;
      if (scene) drawScene(canvasPainter(ctx, cssW, cssH), view, scene);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [client, orient, sceneFn, reducedMotion]);

  // Press anywhere and drag toward the target; the arrow is anchored to the disk.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!client?.canPlan) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const v = viewRef.current;
    if (!d || d.id !== e.pointerId || !client || !v) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    client.setAim(dragToWorldAngle(v, dx, dy));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  };

  return (
    <div className="rink-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={client ? "rink live" : "rink"}
        role="img"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}
