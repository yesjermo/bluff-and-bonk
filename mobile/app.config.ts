import type { ExpoConfig } from "expo/config";

// Domain that serves the web game and the invite links (https://<domain>/r/CODE).
// Set IMPULSE_WEB_DOMAIN at build time so universal links / app links point at it.
const webDomain = process.env.IMPULSE_WEB_DOMAIN || "impulse-duel.example.com";

const config: ExpoConfig = {
  name: "Impulse Duel",
  slug: "impulse-duel",
  scheme: "impulseduel",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  backgroundColor: "#070E22",
  ios: {
    bundleIdentifier: process.env.IMPULSE_IOS_BUNDLE_ID || "com.impulseduel.app",
    supportsTablet: false,
    associatedDomains: [`applinks:${webDomain}`],
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: process.env.IMPULSE_ANDROID_PACKAGE || "com.impulseduel.app",
    adaptiveIcon: {
      backgroundColor: "#070E22",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: webDomain, pathPrefix: "/r/" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: ["expo-font", "expo-dev-client"],
  extra: {
    webDomain,
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
};

export default config;
