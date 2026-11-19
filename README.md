# BLUFF & BONK

[![Play in your browser](https://img.shields.io/badge/play-in%20your%20browser-2CE3F2?style=for-the-badge&labelColor=070E22)](https://yesjermo.github.io/bluff-and-bonk/)

[![CI](https://github.com/yesjermo/bluff-and-bonk/actions/workflows/ci.yml/badge.svg)](https://github.com/yesjermo/bluff-and-bonk/actions/workflows/ci.yml)
[![Deploy web demo](https://github.com/yesjermo/bluff-and-bonk/actions/workflows/pages.yml/badge.svg)](https://github.com/yesjermo/bluff-and-bonk/actions/workflows/pages.yml)
![Platforms](https://img.shields.io/badge/platforms-web%20%7C%20iOS%20%7C%20Android-FF8A2A)
![Python](https://img.shields.io/badge/python-3.11%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-WebSockets-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white)
![React Native Skia](https://img.shields.io/badge/React%20Native-Skia-61DAFB?logo=react&logoColor=black)

**Website:** https://yesjermo.github.io/bluff-and-bonk/

Two players secretly aim their disks, lock a shot, and launch at the same time to
knock a neutral ball into the opposing goal. First to two goals wins.

One authoritative FastAPI server runs the physics and rules. The browser game
(React + Canvas 2D) and the iOS/Android app (Expo + React Native Skia) speak the
same WebSocket protocol, so web, iPhone and Android players share rooms.

> **About the web demo:** GitHub Pages can't run the Python server, so the
> website is built in offline mode. Practice (tutorial + bot) runs entirely in
> your browser using a TypeScript port of the server physics, checked
> against the Python version in CI. Create Room and Join Room are disabled
> there; for online play, run the server yourself (below) or host it and build
> the web app with `VITE_SERVER_URL`.

```
shared/   TypeScript used by both clients: protocol types, constants.json,
          world<->screen transforms, the platform-neutral rink renderer,
          the game client (WebSocket, reconnect, interpolation), status text
server/   FastAPI app: rooms, turn loop, physics, practice bot, tests
web/      Vite + React + Canvas 2D browser game
mobile/   Expo (SDK 58) app: React Native screens + Skia rink
```

## Run it locally

Requirements: Python 3.11+, Node 20+ (tested on Node 24), and for the app,
Xcode (iOS) and/or Android Studio.

### 1. Server (port 8000)

```bash
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Tests (physics tuning, privacy, idempotent locks, timer expiry, reconnect, full match + rematch, practice bot):

```bash
cd server
.venv/bin/python -m pytest -q
```

Shared TypeScript checks: transforms, Python-vs-TypeScript physics parity, and a
live two-client desktop-vs-phone match + rematch against a server on :8000:

```bash
cd web
npm test
npm run test:crossplay
```

### 2. Web (port 5180)

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5180 and press **Play practice**. To play yourself, open a
second tab (or a second browser), **Create room** in one and open the invite link
in the other. Seat tokens are kept per tab, so two tabs are two players and a
refresh rejoins your seat.

### 3. Mobile app

Skia needs a development build (it is not a JavaScript-only library).

```bash
cd mobile
npm install
npx expo run:ios          # builds + installs a dev build on the booted iOS Simulator
npx expo run:android      # same for an Android emulator/device (needs Android Studio)
```

After the first build, `npx expo start --dev-client` is enough for JS changes.

If `expo run:ios` stops with "No code signing certificates", build for the
Simulator directly (no signing needed), then install the `.app`:

```bash
cd mobile/ios && pod install
xcodebuild -workspace BluffBonk.xcworkspace -scheme BluffBonk -sdk iphonesimulator \
  -configuration Debug -derivedDataPath build CODE_SIGNING_ALLOWED=NO
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/BluffBonk.app
```

**Physical device:** the phone must reach the server. In development the app
defaults to `http://<machine running Metro>:8000`, which works when the phone and
computer share Wi-Fi. Otherwise set `EXPO_PUBLIC_SERVER_URL`:

```bash
EXPO_PUBLIC_SERVER_URL=http://192.168.1.20:8000 npx expo start --dev-client
```

For the web game on a phone browser, open `http://<LAN-IP>:5180`; the web client
also defaults to `<page host>:8000`.

## Configuration (separate hosts)

| Where | Variable | Purpose |
|---|---|---|
| server | `ALLOWED_ORIGINS` | Comma-separated CORS origins for the HTTP API (default `*`). |
| server | `ROOM_IDLE_SECONDS` | How long an empty room lives (default 600). |
| web (build time) | `VITE_SERVER_URL` | Backend base URL, e.g. `https://api.example.com`. `wss://…/ws` is derived. |
| web (build time) | `VITE_PUBLIC_WEB_URL` | Origin used in invite links (default: page origin). |
| web (build time) | `VITE_OFFLINE` | `1` = static build with in-browser practice, no server. |
| web (build time) | `VITE_BASE` | Path prefix the site is served under (default `/`). |
| mobile | `EXPO_PUBLIC_SERVER_URL` | Backend base URL for the app. |
| mobile | `EXPO_PUBLIC_WEB_URL` | Web origin used in invite links (`https://<domain>/r/CODE`). |
| mobile (build) | `BONK_WEB_DOMAIN` | Domain for iOS associated domains + Android app links. |
| mobile (build) | `BONK_IOS_BUNDLE_ID`, `BONK_ANDROID_PACKAGE`, `EAS_PROJECT_ID` | Identity for store builds. |

**Offline static build** (what the website uses): `npm run build:pages` builds
with `VITE_OFFLINE=1` and the `/bluff-and-bonk/` base path; practice runs in the
browser and online rooms are disabled. `.github/workflows/pages.yml` deploys it
on every push to `main`.

Deploy the online web build (`npm run build` → `web/dist`) on any static host with an SPA
fallback so `/r/CODE` serves `index.html`. Serve the server behind HTTPS so the
socket is `wss://`. One server process holds all rooms in memory; run a single
instance (or add sticky routing by room code before scaling out).

## Invites and app links

Invites are plain HTTPS links: `https://<web domain>/r/CODE`.

- **No app installed:** the link opens the web game and joins the room directly.
- **App installed + links configured:** iOS universal links / Android app links
  open the app, which joins the room. `bluffbonk://r/CODE` also works.

Still needed before app links work on real devices (not done here):

1. **iOS:** an Apple Developer Team ID. Put `TEAMID.<bundle id>` in
   `web/public/.well-known/apple-app-site-association` and serve it from
   `https://<domain>/.well-known/apple-app-site-association` (JSON, no redirect).
   `app.config.ts` already adds `applinks:<BONK_WEB_DOMAIN>`.
2. **Android:** the SHA-256 fingerprint of the release signing key (from
   `eas credentials` or Play App Signing) in `web/public/.well-known/assetlinks.json`.
   The intent filter with `autoVerify` is in `app.config.ts`.

## EAS builds

`mobile/eas.json` defines:

- `development` — dev client, iOS Simulator build.
- `development-device` — dev client for registered physical devices.
- `preview` — internal distribution (Android APK, ad-hoc iOS) pointed at the
  production URLs in its `env` block (replace the example domains).
- `production` — store builds.

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init                       # creates the project, sets EAS_PROJECT_ID
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile preview --platform ios   # needs Apple credentials
```

Signing still needed: an Apple Developer account (distribution certificate +
ad-hoc provisioning profile with device UDIDs for iOS preview; App Store profile
for production) and an Android keystore (EAS can generate one). No EAS builds
were produced as part of this work; see the build status section of the report.

## Roadmap

**Online play on the website (saved for later).** The website currently runs
practice only. To turn on Create Room / Join Room there:

- [ ] Host `server/` somewhere that supports WebSockets over HTTPS (for example
      Render, Fly.io or Railway) and set `ALLOWED_ORIGINS` to the site origin.
- [ ] In `.github/workflows/pages.yml`, set `VITE_SERVER_URL` to that host; the
      offline build then keeps in-browser practice and enables online rooms.
- [ ] Point `EXPO_PUBLIC_SERVER_URL` / `EXPO_PUBLIC_WEB_URL` in `mobile/eas.json`
      at the same host and site so phones and browsers share rooms.
- [ ] Rooms are in memory on one process: keep a single instance, or add
      sticky routing by room code before scaling out.

## How it works

- **Rules (server-owned):** 8-second planning window, powers 1/2/3, two full-power
  charges per match (spent only when the shot launches), first to two goals.
  On timeout the latest valid aim fires; a player who never aimed stays still.
- **Turn resolution happens once:** each turn has a unique ID; the room's single
  turn coroutine leaves the planning phase exactly once, so simultaneous locks,
  duplicates, timeouts and stale messages can't launch twice or double-charge.
- **Privacy:** aims go only to the server. Before the reveal, the opponent's
  messages carry only `locked: true/false`; shots become public in the `reveal`.
- **Physics:** fixed 240 Hz steps (2 substeps), Coulomb friction + light drag,
  segment walls (so goal posts and corners rebound consistently), impulse
  collisions. A goal counts when the ball fully crosses the line inside the mouth.
  Disks bounce off the goal lines (only the ball enters a net), so nobody can
  park a disk inside their own goal as an unbeatable keeper.
  Snapshots stream at 30 Hz; clients interpolate with an 80 ms buffer.
- **Views:** desktop is horizontal with your goal on the left, phones are vertical
  with your goal at the bottom. Both are pure rotations of the same arena
  (`shared/src/transform.ts`), never mirrors, so a bank off a board is the same
  board for every player.
- **Reconnect:** each seat has a token. Disconnected players have 30 s to return
  (the turn timer keeps running on the server); a returning client gets the
  current public state plus its own lock and shot before controls re-enable.
- **Practice bot:** chooses at the start of each turn from public state only
  (positions, its own charges, score) — it runs before any human input exists.

## Controls

- Drag anywhere on the rink in the direction you want to shoot (arrow starts at your disk; a tap keeps the previous aim).
- Power buttons 1 / 2 / 3 (independent of drag length). Lock shot.
- Keyboard (web): ←/→ (or ↑/↓) aim, Shift for big steps, 1–3 power, Space lock.
