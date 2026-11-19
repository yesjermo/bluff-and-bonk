import { StyleSheet } from "react-native";

export const T = {
  bg: "#070E22",
  bg2: "#0B1530",
  panel: "#0F1B3C",
  panelSel: "#172656",
  line: "#22325E",
  text: "#FFF7EA",
  muted: "#A9B3CC",
  cyan: "#2CE3F2",
  tang: "#FF8A2A",
  good: "#7CF2B0",
  alert: "#FF6B6B",
  display: "BarlowCondensed_800ExtraBold",
  displayBold: "BarlowCondensed_700Bold",
  ui: "Barlow_500Medium",
  uiBold: "Barlow_700Bold",
};

export const sideColor = { A: T.cyan, B: T.tang } as const;

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, gap: 16 },
  btn: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: T.line,
    backgroundColor: T.panel,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  btnText: { color: T.text, fontFamily: T.uiBold, fontSize: 16 },
  primary: { backgroundColor: T.text, borderColor: T.text },
  primaryText: { color: T.bg },
  eyebrow: { color: T.muted, fontFamily: T.displayBold, fontSize: 14, letterSpacing: 1.6, textTransform: "uppercase" },
  muted: { color: T.muted, fontFamily: T.ui, fontSize: 15, textAlign: "center" },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: T.line,
    backgroundColor: T.bg2,
    color: T.text,
    fontFamily: T.display,
    fontSize: 24,
    letterSpacing: 6,
    textAlign: "center",
    flex: 1,
  },
});
