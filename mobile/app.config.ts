import type { ExpoConfig } from "expo/config";

// Domain that serves the web game and the invite links (https://<domain>/r/CODE).
// Set BONK_WEB_DOMAIN at build time so universal links / app links point at it.
const webDomain = process.env.BONK_WEB_DOMAIN || "bluff-and-bonk.example.com";

const config: ExpoConfig = {
  name: "Bluff & Bonk",
  slug: "bluff-and-bonk",
  scheme: "bluffbonk",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  backgroundColor: "#070E22",
  ios: {
    bundleIdentifier: process.env.BONK_IOS_BUNDLE_ID || "com.bluffbonk.app",
    supportsTablet: false,
    associatedDomains: [`applinks:${webDomain}`],
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: process.env.BONK_ANDROID_PACKAGE || "com.bluffbonk.app",
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
