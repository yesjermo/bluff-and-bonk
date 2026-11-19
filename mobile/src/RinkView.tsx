import { Canvas, Picture, Skia, SkPicture } from "@shopify/react-native-skia";
import { useEffect, useRef, useState } from "react";
import { GestureResponderEvent, LayoutChangeEvent, StyleSheet, View } from "react-native";
import type { GameClient } from "../../shared/src/client";
import { drawScene, Scene } from "../../shared/src/render";
import { buildScene } from "../../shared/src/scene";
import { arenaAspect, dragToWorldAngle, makeView } from "../../shared/src/transform";
import { skiaPainter } from "./skiaPainter";

const DRAG_THRESHOLD = 8; // pt: a tap below this keeps the previous aim

interface Props {
  client?: GameClient;
  sceneFn?: (t: number) => Scene;
  reducedMotion: boolean;
  label: string;
  orient?: "h" | "v";
}

export function RinkView({ client, sceneFn, reducedMotion, label, orient = "v" }: Props) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [pic, setPic] = useState<SkPicture | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const aspect = arenaAspect(orient);
  let w = box.w;
  let h = w / aspect;
  if (h > box.h) {
    h = box.h;
    w = h * aspect;
  }
  w = Math.floor(w);
  h = Math.floor(h);

  useEffect(() => {
    if (!w || !h) return;
    let raf = 0;
    const frame = (t: number) => {
      const view = makeView(orient, client?.side ?? "A", w, h);
      const scene = sceneFn ? sceneFn(t) : client ? buildScene(client, t, reducedMotion) : null;
      if (scene) {
        const rec = Skia.PictureRecorder();
        const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, w, h));
        drawScene(skiaPainter(canvas, w, h), view, scene);
        setPic(rec.finishRecordingAsPicture());
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [w, h, client, sceneFn, reducedMotion, orient]);

  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  // Start a drag anywhere on the rink; direction (not distance) sets the aim.
  const onGrant = (e: GestureResponderEvent) => {
    drag.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, moved: false };
  };
  const onMove = (e: GestureResponderEvent) => {
    const d = drag.current;
    if (!d || !client) return;
    const dx = e.nativeEvent.pageX - d.x;
    const dy = e.nativeEvent.pageY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    client.setAim(dragToWorldAngle(makeView(orient, client.side ?? "A", w, h), dx, dy));
  };

  return (
    <View
      style={styles.wrap}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      onStartShouldSetResponder={() => !!client?.canPlan}
      onMoveShouldSetResponder={() => !!client?.canPlan}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
      onResponderRelease={() => (drag.current = null)}
      onResponderTerminate={() => (drag.current = null)}
    >
      {w > 0 && h > 0 && (
        <Canvas style={{ width: w, height: h }} pointerEvents="none">
          {pic && <Picture picture={pic} />}
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 0 },
});
