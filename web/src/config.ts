import { wsUrlFromHttp } from "@shared/client";

const env = import.meta.env;
/** VITE_OFFLINE=1 builds a static site (e.g. GitHub Pages): practice runs in the browser, no server. */
export const OFFLINE = env.VITE_OFFLINE === "1";
export const SERVER_URL: string =
  (env.VITE_SERVER_URL as string | undefined) || `${location.protocol}//${location.hostname}:8000`;
export const WS_URL = OFFLINE && !env.VITE_SERVER_URL ? "" : wsUrlFromHttp(SERVER_URL);
/** Path prefix the app is served under ("/" locally, "/bluff-and-bonk/" on Pages). */
export const BASE = env.BASE_URL.replace(/\/+$/, "");
export const PUBLIC_WEB_URL: string = ((env.VITE_PUBLIC_WEB_URL as string | undefined) || location.origin + BASE).replace(/\/+$/, "");
export const inviteLink = (code: string) => `${PUBLIC_WEB_URL}/r/${code}`;
export const REPO_URL = "https://github.com/yesjermo/bluff-and-bonk";
