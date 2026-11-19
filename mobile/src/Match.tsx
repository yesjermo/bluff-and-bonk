import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { GameClient } from "../../shared/src/client";
import { C, POWER_INFO, Power, Side, other } from "../../shared/src/protocol";
import { stripMessage, timerInfo } from "../../shared/src/status";
import { RinkView } from "./RinkView";
import { sideColor, T } from "./theme";
import { Btn, Pips } from "./ui";

const toneColor = { info: T.line, good: T.good, warn: T.tang, alert: T.alert };

export function Match({
  client,
  onLeave,
  onHowTo,
  reducedMotion,
  haptics,
  setHaptics,
  onTutorialDone,
}: {
  client: GameClient;
  onLeave: () => void;
  onHowTo: () => void;
  reducedMotion: boolean;
  haptics: boolean;
  setHaptics: (v: boolean) => void;
  onTutorialDone: () => void;
}) {
  const st = client.state!;
  const you = client.side!;
  const opp = other(you);
  const turn = st.turn;
  const [powerTouched, setPowerTouched] = useState(false);
  const [menu, setMenu] = useState(false);
  const [, tick] = useState(0);
  const timed = st.phase === "planning" || st.phase === "countdown";
  useEffect(() => {
    if (!timed) return;
    const id = setInterval(() => tick((x) => x + 1), 100);
    return () => clearInterval(id);
  }, [timed]);

  // One short haptic tick on lock; a success buzz on our goals.
  const prev = useRef({ locked: false, result: "" });
  useEffect(() => {
    const locked = client.locked;
    if (locked && !prev.current.locked && haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const r = client.result;
    if (r && r.turnId !== prev.current.result) {
      if (r.goal === you && haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (r.tutorial) onTutorialDone();
    }
    prev.current = { locked, result: r?.turnId ?? prev.current.result };
  });

  const msg = stripMessage(client, powerTouched, true);
  const timer = timerInfo(client);
  const canPlan = client.canPlan;
  const locked = client.locked;
  const tutorial = !!turn?.tutorial;
  const planning = st.phase === "planning";
  const charges = st.charges[you];

  const card = (side: Side) => {
    const isYou = side === you;
    const p = st.players[side];
    const lk = !!turn?.locked[side];
    return (
      <View
        style={{ flex: 1, padding: 8, borderRadius: 12, backgroundColor: T.panel, borderWidth: 1.5, borderColor: isYou ? "#6d7896" : T.line, alignItems: isYou ? "flex-start" : "flex-end", gap: 3 }}
        accessible
        accessibilityLabel={`${isYou ? "You" : "Opponent"}: ${p && !p.connected ? "offline" : planning ? (lk ? "locked" : "planning") : ""}. ${st.charges[side]} full-power charges.`}
      >
        <Text style={{ color: sideColor[side], fontFamily: T.display, fontSize: 19, lineHeight: 20 }}>{isYou ? "YOU" : p?.bot ? "BOT" : "OPPONENT"}</Text>
        <Text style={{ color: lk && planning ? T.text : T.muted, fontFamily: T.uiBold, fontSize: 12 }}>
          {p && !p.connected ? "Offline" : planning ? (lk ? "Locked ●" : "Planning") : " "}
        </Text>
        <Pips n={st.charges[side]} />
      </View>
    );
  };

  const choose = (p: Power) => {
    if (!canPlan || !client.powerAvailable(p)) return;
    client.setPower(p);
    setPowerTouched(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["top", "bottom", "left", "right"]}>
      <View style={{ flex: 1, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 6, gap: 6 }}>
        {/* Top: scoreboard with a fixed-position timer */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {card(you)}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessible accessibilityLabel={`Score: you ${st.score[you]}, opponent ${st.score[opp]}. Timer ${timer.sub} ${timer.label}`}>
            <Text style={{ color: sideColor[you], fontFamily: T.display, fontSize: 40, width: 24, textAlign: "center" }}>{st.score[you]}</Text>
            <View
              style={{
                width: 64,
                height: 52,
                borderRadius: 12,
                backgroundColor: T.bg2,
                borderWidth: 2,
                borderStyle: timer.warn ? "dashed" : "solid",
                borderColor: timer.warn ? T.text : T.line,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <Text style={{ color: T.text, fontFamily: T.display, fontSize: 26, lineHeight: 28 }}>{timer.label}</Text>
              <Text style={{ color: timer.warn ? T.text : T.muted, fontFamily: T.uiBold, fontSize: 9, letterSpacing: 1.4 }}>
                {timer.warn ? "⚠ " : ""}
                {timer.sub}
              </Text>
              <View style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: `${Math.max(0, Math.min(1, timer.fraction)) * 100}%`, backgroundColor: T.text }} />
            </View>
            <Text style={{ color: sideColor[opp], fontFamily: T.display, fontSize: 40, width: 24, textAlign: "center" }}>{st.score[opp]}</Text>
          </View>
          {card(opp)}
        </View>

        {/* Center: rink fills the space; nothing overlays the goals or ball */}
        <View style={{ flex: 1, minHeight: 0 }}>
          <RinkView client={client} reducedMotion={reducedMotion} label={`Rink. You defend the bottom goal; the opponent's goal is at the top.`} />
          <Pressable
            onPress={() => setMenu(!menu)}
            accessibilityRole="button"
            accessibilityLabel="Menu"
            accessibilityState={{ expanded: menu }}
            style={{ position: "absolute", top: 0, right: 0, width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: T.line, backgroundColor: "rgba(7,14,34,0.85)", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: T.muted, fontSize: 18, fontFamily: T.uiBold }}>≡</Text>
          </Pressable>
          {menu && (
            <View style={{ position: "absolute", top: 46, right: 0, padding: 8, gap: 6, borderRadius: 12, backgroundColor: T.bg2, borderWidth: 1, borderColor: T.line, width: 170 }}>
              <Btn label={haptics ? "Haptics: on" : "Haptics: off"} onPress={() => setHaptics(!haptics)} style={{ minHeight: 44 }} />
              <Btn label="How to play" onPress={() => (setMenu(false), onHowTo())} style={{ minHeight: 44 }} />
              <Btn label="Leave match" onPress={onLeave} style={{ minHeight: 44 }} />
            </View>
          )}
          {st.phase === "ended" && (
            <View style={{ position: "absolute", left: 16, right: 16, top: "25%", padding: 22, gap: 12, borderRadius: 18, backgroundColor: "rgba(7,14,34,0.95)", borderWidth: 1.5, borderColor: T.line }} accessibilityViewIsModal>
              <Text style={{ color: T.muted, fontFamily: T.displayBold, fontSize: 14, letterSpacing: 1.6, textAlign: "center" }}>{st.endReason === "forfeit" ? "FORFEIT" : "FULL TIME"}</Text>
              <Text style={{ color: st.winner ? sideColor[st.winner] : T.text, fontFamily: T.display, fontSize: 58, textAlign: "center", lineHeight: 60 }} accessibilityRole="header">
                {st.winner === you ? "YOU WIN" : "YOU LOSE"}
              </Text>
              <Text style={{ color: T.text, fontFamily: T.displayBold, fontSize: 28, textAlign: "center" }}>
                {st.score[you]} – {st.score[opp]}
              </Text>
              {st.endReason !== "forfeit" && (
                <Btn label={st.players[you]?.rematch ? "Waiting for opponent…" : "Rematch"} primary disabled={!!st.players[you]?.rematch} onPress={() => client.rematch()} style={{ minHeight: 60 }} />
              )}
              {st.players[opp]?.rematch && !st.players[you]?.rematch && <Text style={{ color: T.good, fontFamily: T.uiBold, textAlign: "center" }}>Opponent wants a rematch</Text>}
              <Btn label="Leave" onPress={onLeave} />
            </View>
          )}
        </View>

        {/* Reserved message strip */}
        <View style={{ height: 34, borderRadius: 10, backgroundColor: T.bg2, justifyContent: "center", borderLeftWidth: 4, borderLeftColor: toneColor[msg.tone] }}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: T.text, fontFamily: T.uiBold, fontSize: 14, textAlign: "center", paddingHorizontal: 8 }} accessibilityLiveRegion="polite">
            {msg.text}
          </Text>
        </View>

        {/* Bottom: thumb-reach controls */}
        <View style={{ flexDirection: "row", gap: 8, borderRadius: 14, padding: tutorial && client.aim != null && !powerTouched ? 3 : 0, borderWidth: tutorial && client.aim != null && !powerTouched ? 2 : 0, borderStyle: "dashed", borderColor: T.text }} accessibilityRole="radiogroup">
          {([1, 2, 3] as Power[]).map((p) => {
            const sel = client.power === p;
            const avail = client.powerAvailable(p);
            return (
              <Pressable
                key={p}
                onPress={() => choose(p)}
                disabled={!canPlan || !avail}
                accessibilityRole="radio"
                accessibilityState={{ checked: sel, disabled: !canPlan || !avail }}
                accessibilityLabel={`Power ${p}, ${POWER_INFO[p].label}. ${p === 3 ? (tutorial ? "Free on the practice shot" : `${charges} of 2 charges left`) : "Free"}`}
                style={{
                  flex: 1,
                  minHeight: 62,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: sel ? T.text : T.line,
                  borderBottomWidth: sel ? 5 : 2,
                  backgroundColor: sel ? T.panelSel : T.panel,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: !avail || (!canPlan && !sel) ? 0.5 : 1,
                  gap: 2,
                }}
              >
                <Text style={{ color: T.text, fontFamily: T.display, fontSize: 28, lineHeight: 30 }}>{p}</Text>
                {p === 3 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Pips n={tutorial ? 2 : charges} size={0.8} />
                    <Text style={{ color: T.muted, fontFamily: T.ui, fontSize: 11 }}>{tutorial ? "free now" : charges > 0 ? "1 charge" : "none"}</Text>
                  </View>
                ) : (
                  <Text style={{ color: T.muted, fontFamily: T.ui, fontSize: 11 }}>{POWER_INFO[p].label} · free</Text>
                )}
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => client.lock()}
          disabled={!canPlan || client.aim == null}
          accessibilityRole="button"
          accessibilityLabel={locked ? "Shot locked" : client.aim == null ? "Lock shot, aim first" : "Lock shot"}
          accessibilityState={{ disabled: !canPlan || client.aim == null, selected: locked }}
          style={({ pressed }) => ({
            minHeight: 60,
            borderRadius: 14,
            borderWidth: 2,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 10,
            borderColor: locked ? T.good : canPlan && client.aim != null ? T.text : T.line,
            backgroundColor: locked ? "transparent" : canPlan && client.aim != null ? T.text : T.panel,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Text style={{ fontFamily: T.display, fontSize: 22, letterSpacing: 1.5, color: locked ? T.good : canPlan && client.aim != null ? T.bg : T.muted }}>
            {locked ? "✓ SHOT LOCKED" : client.aim == null ? "AIM FIRST" : "LOCK SHOT"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export const FULL_CHARGES = C.rules.fullPowerCharges;
