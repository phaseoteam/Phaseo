# Phaseo mobile

The Phaseo app for Android (iOS later), built with Expo SDK 58, React Native 0.88, Expo Router 58 and [Uniwind](https://uniwind.dev) (Tailwind CSS 4 for React Native).

- **No account needed** for models, providers, compare and releases. These use the public `phaseo.app/api/_web/*` endpoints, and the catalogue is cached on the device.
- **Sign in once** (email and password, Google, GitHub or GitLab, as on the website) for chat, usage, workspace, API keys and notifications. Accounts with an authenticator app must enter their code before anything signed-in loads. The Supabase session is kept in the Android Keystore and refreshed while the app is open. New accounts are created on phaseo.app, which sets up their workspace.
- **Chats live only on the phone** (`expo-sqlite`, with full-text search). Answers stream through the web chat proxy (`phaseo.app/api/chat/*`), so they're billed to the workspace like web chat. As on the website, up to four models can answer side by side, and each model in a chat has its own settings (provider, reasoning, service tier, system prompt, sampling).
- **Long chats** work like the desktop app's: a chat opens at its newest turns and loads older or newer pages as you scroll, keeping at most 60 turns in memory; long answers render in chunks; streamed text is appended to SQLite in small pieces. When a request would fill 80% of a model's context window (the smallest of its providers' windows in the catalogue, or 128k), that model summarises the older messages first, with the same model through the same proxy, and later requests send the summary instead. The chat shows where each summary starts, and the answer's usage includes what the summary cost.
- **Tablets and unfolded foldables** (720 dp wide and up) get a sidebar, with list and detail side by side.

## Layout

```
app/                 Expo Router routes
  (app)/_layout.tsx  Tabs on phones, sidebar on tablets (expo-router/ui headless tabs)
  (app)/<section>/   Each section's stack; SplitStack keeps the list beside the detail on tablets
  sheets/, filters/  Bottom sheets shared by several sections
src/components/ui    Primitives (Text, Button, Row, Section, SearchField, …)
src/features/*       Screens and logic per feature (models, providers, compare, chat, account, notifications)
src/lib/api/*        Typed clients for phaseo.app endpoints (zod)
global.css           Theme tokens, copied from apps/web/src/app/globals.css
```

Design rules shared with the desktop app: sentence-case bold headings (no caps labels), flat rows and dividers rather than cards, plain names.

## Develop on Windows

The app uses native modules (enriched markdown, keyboard controller, SQLite), so it needs a development build rather than Expo Go.

1. Install dependencies from the repository root with `pnpm install`.
2. Create `apps/mobile/.env.local` (gitignored) with the public Supabase settings used by the web app:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<public anon key>
   ```
3. Start an emulator. Android Studio's Device Manager works, or the SDK's `emulator -avd <name>`. You can also plug in a phone with USB debugging on.
4. Build and run the dev client: `pnpm --filter @phaseo/mobile android`. This runs `expo run:android`, which generates `android/` (gitignored), builds with Gradle and starts Metro.
5. After the first build, start Metro only: `pnpm --filter @phaseo/mobile dev`.

For a standalone APK that runs without Metro (for example to install on your own phone):

```
cd apps/mobile
pnpm exec expo prebuild --platform android
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64
# app/build/outputs/apk/release/app-release.apk (signed with the debug key; not for the Play Store)
```

Checks: `pnpm --filter @phaseo/mobile typecheck`, `lint`, `test`, and `pnpm exec expo export --platform android` to bundle the JavaScript.

To see exactly what chat sends, build with `EXPO_PUBLIC_CHAT_DEBUG=1`: each request body is logged to logcat under `[phaseo-chat]`, with message text shortened, attachments left out and no token.

**Windows: native builds loop with `ninja: error: manifest 'build.ninja' still dirty after 100 tries`.** This happens with the SDK's default CMake 3.22: its glob check never settles on pnpm's symlinked package paths (reanimated/worklets, screens). Install CMake 3.31 with the SDK Manager. Then add it to `android/local.properties`, using forward slashes because backslashes are escape characters there, and delete the packages' `android/.cxx` folders before building again:

```
cmake.dir=C:/Users/<you>/AppData/Local/Android/Sdk/cmake/3.31.6
```

## Load tests

"Phaseo Perf" (`app.phaseo.client.perf`) is a separate build for load tests. It installs beside the real app and never touches its chats. Its tools (a stress-data seeder, timing spans, a switch to a local chat stand-in) are bundled only in this build: normal builds inline `EXPO_PUBLIC_PERF_TOOLS` as undefined, so `src/perf/index.ts` becomes `null` and `src/perf/tools.ts` is left out.

```
APP_VARIANT=perf EXPO_PUBLIC_PERF_TOOLS=1 pnpm exec expo prebuild --platform android
cd android && NODE_ENV=production APP_VARIANT=perf EXPO_PUBLIC_PERF_TOOLS=1 ./gradlew assembleRelease
```

Prebuild again without the variables before a normal build (keep `android/local.properties`).

- `phaseo-perf://perf/seed` fills the perf app with 1,000 chats, including a 2,000-turn chat, a 4-model chat of 500 turns, a ~400 KB answer with a 900-row table, and image attachments (`src/perf/seed.ts`).
- `node scripts/perf/sse-standin.mjs --port 8795` is a local stand-in for the web chat proxy's stream (rate, length and summary failures are configurable). Point the perf app at it with `phaseo-perf://perf/origin?url=http%3A%2F%2F10.0.2.2%3A8795` (emulator) or your computer's LAN address (phone); `perf/origin` alone switches back to phaseo.app. Never load-test production.
- `ANDROID_SERIAL=<device> node scripts/perf/measure.mjs <scenario>` runs the scenarios (`seed`, `coldlist`, `listscroll`, `open <chatId>`, `scrolltop <chatId>`, `stream <chatId>`, `db`, `mem`). Timings are `[PhaseoPerf]` lines under logcat's `ReactNativeJS` tag; frames come from `dumpsys gfxinfo` and memory from `dumpsys meminfo`.

## Sign-in setup

Supabase must allow the app's redirect URL. Add `phaseo://auth/callback` to the project's redirect allow-list (Authentication → URL configuration). Without it, sign-in finishes on phaseo.app instead of returning to the app.

## Notifications

Notification settings and rules are in the app. Delivery needs the mobile push service (database rules, the delivery job and the `/api/account/settings/mobile-notifications` routes, built separately) plus:

- An Expo project for this app (`eas init`), so the app can get Expo push tokens.
- Firebase Cloud Messaging credentials for Android, uploaded to the Expo project (`eas credentials`).
- `EXPO_ACCESS_TOKEN` as a secret on the API worker, and `MOBILE_PUSH_ENABLED=true`.

Until then, the Notifications screen says the service is coming soon.

## Not yet

iOS builds (they need an Apple Developer account and EAS Build), sync with the desktop app, model-written chat titles, and code highlighting in answers (`enriched-markdown` code highlighting and math are off; turning them on needs its install script allowed).
