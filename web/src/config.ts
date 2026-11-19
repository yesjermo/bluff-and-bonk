import { wsUrlFromHttp } from "@shared/client";

const env = import.meta.env;
export const SERVER_URL: string =
  (env.VITE_SERVER_URL as string | undefined) || `${location.protocol}//${location.hostname}:8000`;
export const WS_URL = wsUrlFromHttp(SERVER_URL);
export const PUBLIC_WEB_URL: string = ((env.VITE_PUBLIC_WEB_URL as string | undefined) || location.origin).replace(/\/+$/, "");
export const inviteLink = (code: string) => `${PUBLIC_WEB_URL}/r/${code}`;
