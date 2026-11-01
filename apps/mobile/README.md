# Phaseo mobile

The Phaseo app for Android (iOS later), built with Expo SDK 58, React Native 0.88, Expo Router 58 and [Uniwind](https://uniwind.dev) (Tailwind CSS 4 for React Native).

- **No account needed** for models, providers, compare and releases. These use the public `phaseo.app/api/_web/*` endpoints, and the catalogue is cached on the device.
- **Sign in once** (email and password, Google, GitHub or GitLab, as on the website) for chat, usage, workspace, API keys and notifications. Accounts with an authenticator app must enter their code before anything signed-in loads. The Supabase session is kept in the Android Keystore and refreshed while the app is open. New accounts are created on phaseo.app, which sets up their workspace.
- **Chats live only on the phone** (`expo-sqlite`, with full-text search). Answers stream through the web chat proxy (`phaseo.app/api/chat/*`), so they're billed to the workspace like web chat. As on the website, up to four models can answer side by side, and each model in a chat has its own settings (provider, reasoning, service tier, system prompt, sampling).
- **Long chats** work like the desktop app's: a chat opens at its newest turns and loads older or newer pages as you scroll, keeping at most 60 turns in memory; long answers render in chunks; streamed text is appended to SQLite in small pieces. When a request would fill 80% of a model's context window (the smallest of its providers' windows in the catalogue, or 128k), that model summarises the older messages first, with the same model through the same proxy, and later requests send the summary instead. The chat shows where each summary starts, and the answer's usage includes what the summary cost.
- **Chat first.** Signed in, the app opens on a new chat. There's no tab bar: the sidebar holds search and New chat, **Code** (with how many threads need you), the chats, then **Models**, **Providers** and **Usage**, and a profile row (picture or initial, name and workspace) that opens Account. Models, Providers, Usage, Account and Code are the sidebar's sections: choosing one switches the screen to it, and every screen can open the sidebar (see Stacking).
- **The composer** is shared by chats and Code threads (`src/features/composer`; `ChatComposer.tsx` and the Code thread screen configure it). It's one line beside its controls (+, the text, the model's logo, send) until the text wraps, then the text grows above them to four lines and scrolls, and the model shows its name and effort. Focused, the draft's attachments show inside it; otherwise a small thumbnail sits beside the text. With nothing typed, send becomes stop while answers run, or resume while the queue is paused. In a chat, a message sent while answers run is queued on the phone and sent when they finish (`chatQueue.ts`); queued messages show over the composer, where they can be edited (the queue waits) or removed, and a stopped or failed answer pauses the queue. `/` offers model, compare, settings and usage (credit balance and the last 7 days' spend). In a Code thread, send steers a running turn and a long press queues the message on the computer, which the phone can't then edit; there are no attachments or `/` commands, as the phone protocol carries neither. There's no voice input yet.
- **The model control** in the composer shows the model and its effort ("Claude Opus 5.5 · High"; the model alone when it has no effort levels; "+2" when more answer side by side). It opens a sheet at its full height that stays open while you pick: search, favourites and recently picked models first, then the picker's groups with its Free and New filters and a Show more row, and the selected model's effort levels, each marked Default or checked. A pick replaces the first model; the chips under the chat's header add models to compare and open each one's settings. Code's New thread uses the same sheet with the computer's models (`src/features/chat/ModelSheet.tsx`, `modelSheetRows.ts`). Models starts with what Home used to show (the latest and coming releases, the most used models, and links to Compare, Providers and Usage) above the catalogue; Compare opens from a model's "Compare with…", or from models picked with a long press.
- **Signed out**, the app opens on Models, with "Sign in to chat" at the top and links to Compare, Providers and Account. The sidebar works the same way, with Sign in to chat in place of the chats and Models, Providers and Account below, so the gesture learnt before signing in still works after. Signing in opens a new chat, and signing out goes back to Models, each as the only screen.
- **Tablets and unfolded foldables** (720 dp wide and up) keep the sidebar open on the left, with Compare under Models; the chat or the chosen screen fills the rest, and Models, Providers and Account show their list and detail side by side. Before a model is chosen, Models shows the latest releases beside the list.
- **Account** mirrors the website's settings where the app can: usage, credits and recent top-ups, API keys, members, and the workspace's privacy switches (owners and admins can change them; anything that shares more asks first). Paying, inviting, route lists and deleting the account open phaseo.app in the in-app browser. Under "This device": notifications, appearance and chats (storage used, default models, export to Markdown or JSON through the share sheet, delete all). Under Help: live status, what's new (from the docs changelog), feedback by email. Under About: open source licences and diagnostics.
- **The sidebar** is a drawer over every screen on phones and always open on tablets, and it marks the section showing. On a phone, the header's sidebar button (on Chat and each section's root) or a drag to the right opens it, and it follows the finger: let go past half its width, or fling, and it opens; otherwise it snaps back. A drag left on it, a tap on the dimmed chat or Back closes it. The drawer's pan (react-native-drawer-layout's, through `configureGestureHandler`) waits for 20 dp of clear horizontal movement and gives up after 12 dp vertical, so lists scroll, and a horizontal row (model chips, a code block) that starts scrolling first, after the platform's 8 dp, keeps the drag (`src/features/chat/drawerSwipe.ts`). On Chat and a section's root the drag can start anywhere. On a detail (a model, a thread, Compare, an account page) back stays the header's left button and the left 24 dp stay with the platform's back swipe (Android's gesture navigation, iOS's edge swipe), so a drag that starts further in opens the drawer. A sidebar button in the header's right corner was the alternative; the drag keeps detail headers free for their own actions, and Back in the drawer is always one swipe away.
- **Code** shows a paired computer's threads the way the desktop's sidebar does: the computer picker at the top (or Pair a computer), threads that need you first, then project folders (each with New thread) with two-line rows (title and status; branch and time), and settled threads folded at the foot. Status reads as on the desktop: Needs you, Working, Waiting, Failed, Stopped, Limited, Done. A thread opens as its own screen with its title, project and computer, the timeline, approvals and questions as cards over the composer, and the composer with steer, queue and stop; its model shows read-only, as a phone can't change it.
- **Desktops** use Phaseo on a computer from the phone: its threads in Code, with streaming answers, approvals (accept or decline only), questions, steer, stop and new threads, which can pick the model and effort from the computer's list (`list_models`; a computer from before it picks for itself). Account → Desktops pairs, renames and removes computers. Pair by scanning the code in the computer's Settings → Phone, opening its `phaseo://pair` link, or pasting the link. The phone tries the computer's own addresses (same Wi-Fi or a Tailscale tailnet, 1.5 s each) and then Phaseo Connect, which is end-to-end encrypted (`@phaseo/phone-protocol`). Tokens and keys stay in secure storage. Attention from a computer becomes a local notification while the app runs; there is no push for it yet. Normal builds allow plain HTTP for this, because a computer's phone server at an IP address has no certificate. Code: `src/features/desktops`; `client.test.ts` runs both transports against a fake desktop.
- **Charts** read by press and hold: rest a finger on a chart for a quarter of a second, then drag; a bubble with the values follows the finger. A quick swipe that starts on a chart still scrolls the page. With TalkBack, swipe up or down on a chart to step through its points.

## Stacking

The app has one stack (`app/(app)/_layout.tsx`). `src/components/shell/navigation.ts` decides each move (`sidebarMove`, `chatOpens`), `useOpenScreen` applies it, and `navigation.test.ts` covers the rules:

- **Chat is the root.** A chat opened from the sidebar takes the open chat's place, so Chat stays one screen and Back from it leaves the app.
- **Sections switch, they don't stack.** Models, Providers, Usage, Account and Code are the sidebar's sections. From Chat one opens over it; from a section, choosing another (or the same one) resets the stack to Chat with that section at its root (`sectionSwitch`), so at most one section is ever over Chat. Usage opens on its own rather than over Account's list. Sections fade in; details slide.
- **Details push inside a section:** model → model detail → Compare, a thread over the Code list, a page over Account. A section's root leads with the sidebar button; a detail leads with back (`leadsWithSidebar`).
- **Back unwinds the section, then returns to Chat, then leaves the app.** With the drawer open, Back closes it first.
- **Nothing opens twice.** Opening Chat goes back to it (`dismissTo`), as does a detail in a section already under the current one.
- **Links and notifications** open the way the sidebar does, with the section's list under a detail (`withAnchor`): a thread from a notification has the Code list and Chat behind it. Old addresses (`/chat/code/…`, `/desktops/<computer>/…`) redirect to Code.
- **Signed out**, Models is the root in Chat's place, and the same rules apply.

## Layout

```
app/                 Expo Router routes
  (app)/_layout.tsx  One stack: the launch screen with a section over it; the sidebar as a drawer over it on phones, beside it on tablets
  (app)/index.tsx    `/`: redirects to Chat (signed in) or Models (signed out)
  (app)/chat/        Chat
  (app)/<section>/   Each screen's stack; SplitStack keeps the list beside the detail on tablets
  (app)/code/        A paired computer's threads, and each thread over them (/chat/code/* and app/desktops/<id>/* redirect here)
  sheets/, filters/  Bottom sheets shared by several sections
src/components/ui    Primitives (Text, Button, Row, Section, SearchField, …)
src/components/shell Where the app opens, the sidebar's footer, and how screens open over each other (navigation.ts)
src/features/*       Screens and logic per feature (models, providers, compare, chat, account, notifications)
src/lib/api/*        Typed clients for phaseo.app endpoints (zod)
global.css           Fonts, radii and the theme tokens (generated from packages/shared/app-kit/src/theme/tokens.ts)
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

**Build number.** `app.config.ts` sets the Android `versionCode` and iOS build number to `git rev-list --count HEAD`, so a build from a later commit has a higher number. Account shows it as "0.1.0 (build 2493)", and Diagnostics adds the commit. Prebuild writes the number into `android/app/build.gradle`, so prebuild again after committing. Android won't install a lower `versionCode` over a higher one: a build from a branch with fewer commits needs the installed app removed first. Outside a git checkout, or in a shallow clone, the number falls back to app.json's `versionCode` (1 when unset).

Checks: `pnpm --filter @phaseo/mobile typecheck`, `lint`, `test`, and `pnpm exec expo export --platform android` to bundle the JavaScript.

**Open source licences** (Account → Open source licences) come from `src/features/account/licences.generated.json`, written by `pnpm --filter @phaseo/mobile licences` from `pnpm licenses list --prod` and each package's licence files (identical texts are stored once; copyright lines are kept per package). `pnpm build` regenerates it, and a Jest test fails when it no longer matches the installed packages, so run the script and commit the file after changing dependencies.

**Diagnostics** (Account → Diagnostics) keep the last 100 operations that took 50 ms or more (opening a chat, loading a page of it, streaming flushes, building requests, summaries) in memory only (`src/lib/diagnostics.ts`). This is separate from the perf build's spans. Nothing is sent anywhere unless the user copies or shares it.

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

On Android, pushes arrive on one of ten channels (`src/features/notifications/channels.ts`), so each kind has its own sound and pop-up settings: New models, Prices and providers (silent), Deprecations, Money, Your traffic and Security (these three pop up), Jobs, Account, Digest (silent) and Tests. The server only uses them for phones registered with `channelScheme: 2`; until then it sends everything to the old `model-updates` channel, which the app keeps until a server accepts scheme 2. On every start, a phone with notifications on registers again if anything changed, so existing installs move over by themselves. The same channels, minus Tests, are the Categories on the Notifications screen, which appear once the server returns them. `defaultChannel` in `app.json` is where Firebase puts a push whose channel doesn't exist, so it names a channel that always does; changing it needs `expo prebuild` before a native build.

## Not yet

iOS builds (they need an Apple Developer account and EAS Build), push notifications from a paired computer while the app is closed, model-written chat titles, and code highlighting in answers (`enriched-markdown` code highlighting and math are off; turning them on needs its install script allowed).
