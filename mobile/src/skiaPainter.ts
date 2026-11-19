import { matchFont, PaintStyle, SkCanvas, SkFont, Skia, StrokeCap, StrokeJoin } from "@shopify/react-native-skia";
import { Platform } from "react-native";
import type { Painter } from "../../shared/src/render";
import type { Vec } from "../../shared/src/protocol";

const fonts = new Map<number, SkFont>();
function font(size: number): SkFont {
  const key = Math.round(size);
  let f = fonts.get(key);
  if (!f) {
    f = matchFont({
      fontFamily: Platform.select({ ios: "Helvetica Neue", default: "sans-serif-condensed" }),
      fontSize: key,
      fontWeight: "bold",
    });
    fonts.set(key, f);
  }
  return f;
}

const fill = Skia.Paint();
fill.setAntiAlias(true);
const stroke = Skia.Paint();
stroke.setAntiAlias(true);
stroke.setStyle(PaintStyle.Stroke);
stroke.setStrokeCap(StrokeCap.Round);
stroke.setStrokeJoin(StrokeJoin.Round);

function poly(pts: Vec[], closed: boolean) {
  const b = Skia.PathBuilder.Make();
  pts.forEach(([x, y], i) => (i ? b.lineTo(x, y) : b.moveTo(x, y)));
  if (closed) b.close();
  return b.detach();
}

/** Adapts the shared renderer to a Skia canvas (used inside a PictureRecorder). */
export function skiaPainter(c: SkCanvas, w: number, h: number): Painter {
  return {
    clear(color) {
      fill.setColor(Skia.Color(color));
      fill.setAlphaf(1);
      c.drawRect(Skia.XYWHRect(0, 0, w, h), fill);
    },
    fillPoly(pts, color, alpha = 1) {
      fill.setColor(Skia.Color(color));
      fill.setAlphaf(alpha);
      c.drawPath(poly(pts, true), fill);
    },
    strokePoly(pts, color, width, alpha = 1, closed = false, dash) {
      stroke.setColor(Skia.Color(color));
      stroke.setAlphaf(alpha);
      stroke.setStrokeWidth(width);
      stroke.setPathEffect(dash ? Skia.PathEffect.MakeDash(dash, 0) : null);
      c.drawPath(poly(pts, closed), stroke);
      stroke.setPathEffect(null);
    },
    fillCircle(x, y, r, color, alpha = 1) {
      fill.setColor(Skia.Color(color));
      fill.setAlphaf(alpha);
      c.drawCircle(x, y, r, fill);
    },
    strokeCircle(x, y, r, color, width, alpha = 1) {
      stroke.setColor(Skia.Color(color));
      stroke.setAlphaf(alpha);
      stroke.setStrokeWidth(width);
      c.drawCircle(x, y, r, stroke);
    },
    text(s, x, y, size, color, alpha = 1) {
      const f = font(size);
      const width = f.measureText(s).width;
      fill.setColor(Skia.Color(color));
      fill.setAlphaf(alpha);
      c.drawText(s, x - width / 2, y + size * 0.36, fill, f);
    },
  };
}
