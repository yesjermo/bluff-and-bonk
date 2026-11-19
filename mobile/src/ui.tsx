import { ReactNode } from "react";
import { Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import { s, sideColor, T } from "./theme";
import type { Side } from "../../shared/src/protocol";

export function Btn({
  label,
  onPress,
  primary,
  disabled,
  style,
  hint,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.btn, primary && s.primary, disabled && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.98 }] }, style]}
    >
      <Text style={[s.btnText, primary && s.primaryText]}>{label}</Text>
    </Pressable>
  );
}

/** Player chip: color AND shape (triangle for A, square for B). */
export function ShapeChip({ side, size = 24 }: { side: Side; size?: number }) {
  const c = sideColor[side];
  const m = size * 0.3;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: size * 0.62, height: size * 0.62, borderRadius: size, backgroundColor: "#060B1A", alignItems: "center", justifyContent: "center" }}>
        {side === "A" ? (
          <View style={{ width: 0, height: 0, borderLeftWidth: m / 2, borderRightWidth: m / 2, borderBottomWidth: m * 0.85, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: c }} />
        ) : (
          <View style={{ width: m * 0.8, height: m * 0.8, backgroundColor: c }} />
        )}
      </View>
    </View>
  );
}

export function Pips({ n, of = 2, size = 1 }: { n: number; of?: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {Array.from({ length: of }, (_, i) => (
        <View
          key={i}
          style={{
            width: 9 * size,
            height: 14 * size,
            borderRadius: 2,
            borderWidth: 2,
            borderColor: i < n ? T.text : T.muted,
            backgroundColor: i < n ? T.text : "transparent",
            transform: [{ skewX: "-12deg" }],
          }}
        />
      ))}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", gap: 10 }, style]}>{children}</View>;
}
