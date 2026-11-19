import Constants from "expo-constants";
import { wsUrlFromHttp } from "../../shared/src/client";

// In development, default to the machine running Metro so a phone on the same
// Wi-Fi reaches the local FastAPI server without extra setup.
function devHost(): string {
  const hostUri = Constants.expoConfig?.hostUri ?? "";
  const host = hostUri.split(":")[0];
  return host ? `http://${host}:8000` : "http://localhost:8000";
}

export const SERVER_URL = (process.env.EXPO_PUBLIC_SERVER_URL || devHost()).replace(/\/+$/, "");
export const WS_URL = wsUrlFromHttp(SERVER_URL);
const webDomain = (Constants.expoConfig?.extra as { webDomain?: string } | undefined)?.webDomain;
export const PUBLIC_WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || (webDomain ? `https://${webDomain}` : "http://localhost:5180")).replace(/\/+$/, "");
export const inviteLink = (code: string) => `${PUBLIC_WEB_URL}/r/${code}`;

/** Extract a room code from https://<domain>/r/CODE or impulseduel://r/CODE. */
export function roomFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = /\/r\/([A-Za-z0-9]{4})(?:[/?#]|$)/.exec(url) || /^impulseduel:\/\/r\/([A-Za-z0-9]{4})/.exec(url);
  return m ? m[1].toUpperCase() : null;
}
