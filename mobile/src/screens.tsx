import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, Share, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { GameClient } from "../../shared/src/client";
import { demoScene } from "../../shared/src/demo";
import { SIDE_NAME, Side, other } from "../../shared/src/protocol";
import { inviteLink } from "./config";
import { RinkView } from "./RinkView";
import { s, T } from "./theme";
import { Btn, Row, ShapeChip } from "./ui";

export function Home({
  client,
  onPractice,
  onHowTo,
  reducedMotion,
}: {
  client: GameClient;
  onPractice: () => void;
  onHowTo: () => void;
  reducedMotion: boolean;
}) {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const sceneFn = useCallback((t: number) => demoScene(t, reducedMotion), [reducedMotion]);
  const busy = client.status === "connecting" || client.status === "reconnecting";
  return (
    <SafeAreaView style={s.screen}>
      <View style={[s.center, { gap: 18 }]}>
        <View style={{ alignItems: "center" }} accessible accessibilityRole="header" accessibilityLabel="Bluff & Bonk">
          <Text style={{ color: T.text, fontFamily: T.display, fontSize: 64, lineHeight: 62, fontStyle: "italic" }}>
            BLUFF <Text style={{ color: T.tang }}>&amp;</Text> <Text style={{ color: T.cyan }}>BONK</Text>
          </Text>
          <Text style={[s.muted, { fontSize: 18 }]}>Aim in secret. Shoot together.</Text>
        </View>
        <View style={{ width: "100%", aspectRatio: 234 / 112 }}>
          <RinkView orient="h" sceneFn={sceneFn} reducedMotion={reducedMotion} label="Demo: a bank shot off the boards into the far goal" />
        </View>
        <View style={{ width: "100%", gap: 10 }}>
          <Btn label="Play Practice" primary onPress={onPractice} disabled={busy} style={{ minHeight: 60 }} />
          <Row>
            <Btn label="Create Room" onPress={() => client.create()} disabled={busy} style={{ flex: 1 }} />
            {!joining && <Btn label="Join Room" onPress={() => setJoining(true)} disabled={busy} style={{ flex: 1 }} />}
          </Row>
          {joining && (
            <Row>
              <TextInput
                style={s.input}
                value={code}
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={4}
                placeholder="CODE"
                placeholderTextColor={T.muted}
                accessibilityLabel="Room code"
                onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                onSubmitEditing={() => code.length === 4 && client.join(code)}
                returnKeyType="go"
              />
              <Btn label="Join" onPress={() => client.join(code)} disabled={code.length !== 4 || busy} />
            </Row>
          )}
          <Text style={s.muted} accessibilityLiveRegion="polite">
            {client.status === "connecting" ? "Connecting…" : client.status === "reconnecting" ? "Can't reach the server — retrying…" : " "}
          </Text>
          <Btn label="How to play" onPress={onHowTo} style={{ backgroundColor: "transparent", borderWidth: 0, minHeight: 44 }} />
        </View>
      </View>
    </SafeAreaView>
  );
}

export function Lobby({ client, onLeave }: { client: GameClient; onLeave: () => void }) {
  const st = client.state!;
  const you = client.side!;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (client.synced && !st.players[you]?.ready) client.ready();
  }, [client.synced, st.players[you]?.ready]);
  const link = inviteLink(st.room);
  const slot = (side: Side) => {
    const p = st.players[side];
    return (
      <View key={side} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: T.panel, borderWidth: 1.5, borderColor: T.line }}>
        <ShapeChip side={side} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: T.text, fontFamily: T.display, fontSize: 22 }}>{side === you ? "YOU" : p ? "Opponent" : "Waiting for opponent"}</Text>
          <Text style={{ color: T.muted, fontFamily: T.ui, fontSize: 13 }}>{SIDE_NAME[side]}</Text>
        </View>
        <Text style={{ color: T.muted, fontFamily: T.uiBold }}>{!p ? "Open slot…" : !p.connected ? "Reconnecting…" : p.ready ? "Ready" : "Joining…"}</Text>
      </View>
    );
  };
  return (
    <SafeAreaView style={s.screen}>
      <Btn label="← Leave" onPress={onLeave} style={{ alignSelf: "flex-start", marginLeft: 16, marginTop: 8, minHeight: 40, backgroundColor: "transparent" }} />
      <View style={s.center}>
        <Text style={s.eyebrow}>Private room</Text>
        <Text
          accessibilityLabel={`Room code ${st.room.split("").join(" ")}`}
          selectable
          style={{ color: T.text, fontFamily: T.display, fontSize: 104, letterSpacing: 12, lineHeight: 110 }}
        >
          {st.room}
        </Text>
        <Row>
          <Btn
            label={copied ? "Copied ✓" : "Copy Code"}
            onPress={async () => {
              await Clipboard.setStringAsync(st.room);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
          <Btn label="Invite Friend" primary onPress={() => Share.share({ message: `Play me in BLUFF & BONK: ${link}`, url: link })} />
        </Row>
        <View style={{ width: "100%", gap: 10 }}>{[you, other(you)].map(slot)}</View>
        <Text style={s.muted} accessibilityLiveRegion="polite">
          {client.status !== "open"
            ? "Reconnecting to the server…"
            : st.players.A && st.players.B
              ? "Both players here — starting…"
              : "Share the code or invite. Friends can play in a browser — no install needed."}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const ERR_TITLES: Record<string, string> = { invalid: "Room not found", expired: "Room expired", full: "Room is full" };

export function RoomError({ client, onHome }: { client: GameClient; onHome: () => void }) {
  const e = client.error!;
  const [code, setCode] = useState("");
  return (
    <SafeAreaView style={s.screen}>
      <View style={s.center} accessibilityRole="alert">
        <Text style={s.eyebrow}>{e.room ? `Room ${e.room}` : "Room"}</Text>
        <Text style={{ color: T.text, fontFamily: T.display, fontSize: 48 }}>{ERR_TITLES[e.code] ?? "Can't join"}</Text>
        <Text style={s.muted}>{e.message}</Text>
        <View style={{ width: "100%", gap: 10 }}>
          {e.code === "invalid" && (
            <Row>
              <TextInput
                style={s.input}
                value={code}
                autoCapitalize="characters"
                maxLength={4}
                placeholder="CODE"
                placeholderTextColor={T.muted}
                accessibilityLabel="Room code"
                onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
              <Btn label="Try again" onPress={() => client.join(code)} disabled={code.length !== 4} />
            </Row>
          )}
          <Btn label={e.code === "expired" ? "Create a New Room" : "Create Room"} primary onPress={() => client.create()} />
          <Btn label="Play Practice" onPress={() => client.practice(false)} />
          <Btn label="Back to start" onPress={onHome} style={{ backgroundColor: "transparent", borderWidth: 0 }} />
        </View>
      </View>
    </SafeAreaView>
  );
}

export function HowTo({ visible, onClose, onReplay }: { visible: boolean; onClose: () => void; onReplay: () => void }) {
  const items = [
    ["Aim in secret.", "Drag anywhere on the rink the way you want to shoot. The arrow always starts at your disk."],
    ["Pick power 1, 2 or 3.", "Level 3 hits hardest, but you get two per match. A charge is spent only when that shot launches."],
    ["Lock your shot", "within 8 seconds. If time runs out, your latest aim fires. Never aimed? Your disk stays put."],
    ["Shoot together.", "Both arrows are revealed, then both disks launch at once. Bank, block or bluff."],
    ["First to two goals wins.", "The ball must fully cross the goal line."],
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(3,6,16,0.8)", justifyContent: "center", padding: 16 }}>
        <View style={{ backgroundColor: T.bg2, borderRadius: 18, borderWidth: 1.5, borderColor: T.line, padding: 20, maxHeight: "90%" }}>
          <Text style={{ color: T.text, fontFamily: T.display, fontSize: 34, marginBottom: 8 }} accessibilityRole="header">
            How to play
          </Text>
          <ScrollView>
            {items.map(([b, t], i) => (
              <Text key={i} style={{ color: T.text, fontFamily: T.ui, fontSize: 16, lineHeight: 23, marginBottom: 10 }}>
                {i + 1}. <Text style={{ fontFamily: T.uiBold }}>{b}</Text> {t}
              </Text>
            ))}
          </ScrollView>
          <Row style={{ justifyContent: "flex-end", marginTop: 8 }}>
            <Btn label="Replay tutorial" onPress={onReplay} />
            <Btn label="Got it" primary onPress={onClose} />
          </Row>
        </View>
      </View>
    </Modal>
  );
}
