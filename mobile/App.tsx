import { Barlow_500Medium, Barlow_700Bold } from "@expo-google-fonts/barlow";
import { BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from "@expo-google-fonts/barlow-condensed";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useEffect, useReducer, useState } from "react";
import { AccessibilityInfo, AppState, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GameClient, KeyValueStore } from "../shared/src/client";
import { roomFromUrl, WS_URL } from "./src/config";
import { Match } from "./src/Match";
import { HowTo, Home, Lobby, RoomError } from "./src/screens";
import { T } from "./src/theme";

const store: KeyValueStore = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
};
const client = new GameClient(WS_URL, store);

export default function App() {
  const [fontsLoaded] = useFonts({ Barlow_500Medium, Barlow_700Bold, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold });
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [howTo, setHowTo] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [haptics, setHapticsState] = useState(true);
  const [tutorialDone, setTutorialDone] = useState(false);

  useEffect(() => client.subscribe(force), []);
  useEffect(() => {
    void AsyncStorage.multiGet(["bonk.haptics", "bonk.tutorialDone"]).then(([h, t]) => {
      if (h[1] === "0") setHapticsState(false);
      if (t[1] === "1") setTutorialDone(true);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const rm = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    // Invite links: https://<web>/r/CODE (universal/app links) or bluffbonk://r/CODE.
    void Linking.getInitialURL().then((u) => {
      const code = roomFromUrl(u);
      if (code) void client.join(code);
    });
    const ls = Linking.addEventListener("url", ({ url }) => {
      const code = roomFromUrl(url);
      if (code && code !== client.state?.room) void client.join(code);
    });
    // Coming back from the background: reconnect and re-sync before enabling controls.
    const as = AppState.addEventListener("change", (s) => s === "active" && client.resume());
    return () => {
      rm.remove();
      ls.remove();
      as.remove();
    };
  }, []);

  const setHaptics = (v: boolean) => {
    setHapticsState(v);
    void AsyncStorage.setItem("bonk.haptics", v ? "1" : "0");
  };
  const markTutorial = () => {
    setTutorialDone(true);
    void AsyncStorage.setItem("bonk.tutorialDone", "1");
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: T.bg }} />;
  const st = client.state;
  let screen;
  if (client.error) screen = <RoomError client={client} onHome={() => client.leave()} />;
  else if (!st) screen = <Home client={client} onPractice={() => client.practice(!tutorialDone)} onHowTo={() => setHowTo(true)} reducedMotion={reduced} />;
  else if (st.phase === "lobby" && !st.practice) screen = <Lobby client={client} onLeave={() => client.leave()} />;
  else
    screen = (
      <Match
        client={client}
        onLeave={() => client.leave()}
        onHowTo={() => setHowTo(true)}
        reducedMotion={reduced}
        haptics={haptics}
        setHaptics={setHaptics}
        onTutorialDone={markTutorial}
      />
    );

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: T.bg }}>{screen}</View>
      <HowTo
        visible={howTo}
        onClose={() => setHowTo(false)}
        onReplay={() => {
          setHowTo(false);
          client.practice(true);
        }}
      />
    </SafeAreaProvider>
  );
}
