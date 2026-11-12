# Phaseo mobile

The Phaseo app for Android (iOS later), built with Expo SDK 58, React Native 0.88, Expo Router 58 and [Uniwind](https://uniwind.dev) (Tailwind CSS 4 for React Native).

- **No account needed** for models, providers, compare and releases. These use the public `phaseo.app/api/_web/*` endpoints, and the catalogue is cached on the device.
- **Sign in once** (email and password, Google, GitHub or GitLab, as on the website) for chat, usage, workspace, API keys and notifications. Accounts with an authenticator app must enter their code before anything signed-in loads. The Supabase session is kept in the Android Keystore and refreshed while the app is open. New accounts are created on phaseo.app, which sets up their workspace.
- **Chats live only on the phone** (`expo-sqlite`, with full-text search). Answers stream through the web chat proxy (`phaseo.app/api/chat/*`), so they're billed to the workspace like web chat. As on the website, up to four models can answer side by side, and each model in a chat has its own settings (provider, reasoning, service tier, system prompt, sampling).
- **Long chats** work like the desktop app's: a chat opens at its newest turns and loads older or newer pages as you scroll, keeping at most 60 turns in memory; long answers render in chunks; streamed text is appended to SQLite in small pieces. When a request would fill 80% of a model's context window (the smallest of its providers' windows in the catalogue, or 128k), that model summarises the older messages first, with the same model through the same proxy, and later requests send the summary instead. The chat shows where each summary starts, and the answer's usage includes what the summary cost.
- **Chat first.** Signed in, the app opens on a new chat. There's no tab bar. The top of the sidebar switches what the app works in: **Phaseo** (search, New chat and the chats on this phone) or a paired computer (its projects and threads; see "A computer as the workspace"). Below are **Models**, **Providers** and **Usage**, and a profile row (picture or initial, name and workspace) that opens Account. Models, Providers, Usage and Account are the sidebar's sections: choosing one switches the screen to it, and every screen can open the sidebar (see Stacking).
- **The composer** is shared by chats and Code threads (`src/features/composer`; `ChatComposer.tsx` and the Code thread screen configure it). It's one surface: one line beside its controls (+, the text, the model with its logo, name and effort, send) until the text wraps, then the text grows above them to four lines and scrolls. Beside one line the model's name truncates first, and the text keeps at least 40% of the row. Nothing sits under it. Pressed mid-message, the model control closes the keyboard before its sheet opens, or the sheet would size itself to the space above the keyboard. Focused, the draft's attachments show inside it; otherwise a small thumbnail sits beside the text. With nothing typed, send becomes stop while answers run, or resume while the queue is paused. In a chat, a message sent while answers run is queued on the phone and sent when they finish (`chatQueue.ts`); queued messages show over the composer, where they can be edited (the queue waits) or removed, and a stopped or failed answer pauses the queue. `/` offers model, compare, settings and usage (credit balance and the last 7 days' spend). In a Code thread, send steers a running turn and a long press queues the message on the computer, which the phone can't then edit; there are no attachments or `/` commands, as the phone protocol carries neither. There's no voice input yet.
- **The model control** in the composer shows the model and its effort ("Claude Opus 5.5 · High"; the model alone when it has no effort levels; "+2" when more answer side by side). It opens a tall sheet that stays open while you pick. Fixed at its top are the chosen model, with its effort folded into one row that opens the levels (each marked Default or ticked), then search and the Free and New filters. The list below has favourites and recently picked models first, then the picker's groups and a Show more row; each row has the lab's logo, the name, the context and price per million tokens, and a star to add or remove a favourite. A pick replaces the first model; the chips under the chat's header add models to compare and open each one's settings. A computer's new thread uses the same sheet (`src/features/chat/ModelSheet.tsx`, `modelSheetRows.ts`) with Phaseo and On this computer tabs, as in the desktop window: the window's favourites first, Phaseo's models by release month (named and priced from this phone's catalogue), and each coding agent's models under its name with older ones folded; an agent the computer couldn't read says why. Models has its search and one row of filters (sort, the filters sheet, labs, On Phaseo, Free) at the top. On phones the latest releases follow, a few of them (retirements and announcements of what is coming are left to the website), then "All models" with Compare; a search or filter hides them, so the matches come straight under the filters. They're kept as a vertical section rather than a sideways strip, which would hide most of the list and compete with the drag that opens the sidebar; Compare opens from a model's "Compare with…", or from models picked with a long press.
- **Signed out**, the app opens on Models, with "Sign in to chat" at the top and links to Compare, Providers and Account. The sidebar works the same way, with Sign in to chat in place of the chats and Models, Providers and Account below, so the gesture learnt before signing in still works after. Signing in opens a new chat, and signing out goes back to Models, each as the only screen.
- **Tablets and unfolded foldables** (720 dp wide and up) keep the sidebar open on the left, with Compare under Models; the chat or the chosen screen fills the rest, and Models, Providers and Account show their list and detail side by side. Before a model is chosen, Models shows the latest releases beside the list.
- **Account** mirrors the website's settings where the app can: usage, credits and recent top-ups, API keys, members, and the workspace's privacy switches (owners and admins can change them; anything that shares more asks first). Paying, inviting, route lists and deleting the account open phaseo.app in the in-app browser. Under "This device": notifications, appearance and chats (storage used, default models, export to Markdown or JSON through the share sheet, delete all). Under Help: live status, what's new (from the docs changelog), feedback by email, and Triage a bug once a computer is paired (see "Triage on a computer"). Under About: open source licences and diagnostics.
- **Triage on a computer.** Account → Help → Triage a bug has an agent on a paired computer (the one the app works in, else the first; another can be picked) debug this app from its own source: the computer fetches the build's commit (`buildSha`, stamped by `app.config.ts` with `buildDirty` for uncommitted changes), starts a Code thread pointed at a playbook about `apps/mobile`, and the phone opens that thread. The phone sends its version, build number, phone and OS, what you wrote, and (unless switched off) its recent slow operations by name and time, never their details. It needs a computer from protocol 8 with Read code and Make changes allowed for this phone; the first triage of a version can take a few minutes while the computer fetches the source. When the agent drafts an issue, the thread shows it over the composer with File issue and Discard (Make changes again, and File asks first); nothing is filed otherwise. Code: `src/features/desktops/triage`.
- **The sidebar** is a drawer over every screen on phones and always open on tablets, and it marks the section showing. On a phone, the header's sidebar button (on Chat and each section's root) or a drag to the right opens it, and it follows the finger: let go past half its width, or fling, and it opens; otherwise it snaps back. A drag left on it, a tap on the dimmed chat or Back closes it. The drawer's pan (react-native-drawer-layout's, through `configureGestureHandler`) waits for 20 dp of clear horizontal movement and gives up after 12 dp vertical, so lists scroll (`src/features/chat/drawerSwipe.ts`). Sideways rows (filter chips, the chat's model chips, answer tabs, attachments, carousels) use `HorizontalScroll` (`src/components/ui/horizontal-scroll.tsx`), which takes the drawer's swipe lock when a finger lands on the row and frees it when the finger lifts (`src/components/shell/swipeLock.ts`). The row keeps the drag when the finger drifts off it, as a thumb's swipe does; gesture-handler's native gesture would otherwise cancel there and the row would stop following. The lock is a Reanimated shared value: the row sets it from its touch-down callback and the drawer's pan fails itself from its touch-move callback while it's held, both on the UI thread, and gesture-handler runs every handler's touch callbacks before any of them can activate on that touch, so the drawer never takes, follows or opens on a drag that started on a row, in either direction, even at the row's start. A drag anywhere else opens the sidebar. A lock that's never freed lapses after 5 s. Momentum doesn't hold it: a finger on the coasting row takes it again, and one anywhere else opens the sidebar. (Registering the row's scroll with the pan through gesture relations lost real finger drags to the drawer.) A bare `<ScrollView horizontal>` would lose the drag to the drawer, so ESLint rejects one. Code blocks and tables in answers scroll natively inside the markdown view and aren't registered. On Chat and a section's root the drag can start anywhere. On a detail (a model, a thread, Compare, an account page) back stays the header's left button and the left 24 dp stay with the platform's back swipe (Android's gesture navigation, iOS's edge swipe), so a drag that starts further in opens the drawer. A sidebar button in the header's right corner was the alternative; the drag keeps detail headers free for their own actions, and Back in the drawer is always one swipe away.
- **A computer as the workspace.** The switcher at the top of the sidebar lists Phaseo and each paired computer (with its connection and how many threads need you there), then Pair a computer… and Manage computers…; closed, it shows how many need you on the others. The choice is remembered (`src/features/desktops/picked.ts`), and opening a computer's thread from a notification switches to that computer. With a computer chosen, the sidebar lists its threads the way the desktop's sidebar does: threads that need you first, then a folder for every project (empty ones too, pinned first; from `list_projects`, or from the threads on an older computer), each with New thread, then settled threads folded at the foot. Rows are two lines: the title and time, then the status, why it needs you, the project (outside its folder) and the worktree's branch. Status reads as on the desktop: Needs you, Working, Waiting, Failed, Stopped, Limited, Done. A thread opens like a chat in Chat (it leads with the sidebar, and one from the sidebar takes the open thread's place) with its title, project and computer, the timeline, approvals and questions as cards over the composer, and a floating composer with steer, queue and stop, the queued messages over it (Send now, Edit, Move, Remove) and the model beside send. The model opens the thread's settings: its model and effort, Code or Plan, and its permissions, read-only; they change while it is stopped. A computer from before protocol 3 shows the model without letting it change. A turn that changed files ends with a "3 files changed · +12 −4" row, and tool steps fold into one work log line ("Ran 4 tools"). On a computer from protocol 3, a row in the sidebar swipes left to settle or snooze (wake or archive when snoozed, archive or unsettle when settled), and a long press offers Pin, Rename, Mark unread, Snooze…, Settle and Archive, each with Undo. Account → Desktops lists each computer's archived threads with Restore.
- **Desktops** use Phaseo on a computer from the phone: its threads in Code, with streaming answers, approvals (accept or decline only), questions, steer, stop and new threads. A new thread is an empty thread with the composer focused under "What should we build in ‹project›?" (tap the project to pick another; a Code or Plan thread in a git project picks Local or a new worktree under it). The model beside send (any agent on the computer, starting where its window would: the project's default, else the last model picked there) opens the thread's settings: the model and effort, the mode (Chat, Code or Plan) and the permissions, shown read-only (the project's default, else the latest thread's). While the computer's models load, or when it won't list them, it opens the mode alone. The draft is kept per computer and project (`list_models`; a computer from before it picks the model itself). Account → Desktops pairs, renames and removes computers. Pair by scanning the code in the computer's Settings → Phone, opening its `phaseo://pair` link, or pasting the link. The phone tries the computer's own addresses (same Wi-Fi or a Tailscale tailnet, 1.5 s each) and then Phaseo Connect, which is end-to-end encrypted (`@phaseo/phone-protocol`). Tokens and keys stay in secure storage. Attention from a computer becomes a local notification while the app runs; there is no push for it yet. Normal builds allow plain HTTP for this, because a computer's phone server at an IP address has no certificate. Code: `src/features/desktops`; `client.test.ts` runs both transports against a fake desktop.
- **Charts** read by press and hold: rest a finger on a chart for a quarter of a second, then drag; a bubble with the values follows the finger. A quick swipe that starts on a chart still scrolls the page. With TalkBack, swipe up or down on a chart to step through its points.

## Stacking

The app has one stack (`app/(app)/_layout.tsx`). `src/components/shell/navigation.ts` decides each move (`sidebarMove`, `chatOpens`), `useOpenScreen` applies it, and `navigation.test.ts` covers the rules:

- **Chat is the root.** A chat opened from the sidebar takes the open chat's place, so Chat stays one screen and Back from it leaves the app.
- **Sections switch, they don't stack.** Models, Providers, Usage and Account are the sidebar's sections. From Chat one opens over it; from a section, choosing another (or the same one) resets the stack to Chat with that section at its root (`sectionSwitch`), so at most one section is ever over Chat. Usage opens on its own rather than over Account's list. Sections fade in; details slide.
- **Details push inside a section:** model → model detail → Compare, a page over Account. A computer's thread (`/code/<computer>/<thread>`) is like a chat: it leads with the sidebar, which lists the other threads. A section's root leads with the sidebar button; a detail leads with back (`leadsWithSidebar`).
- **Back unwinds the section, then returns to Chat, then leaves the app.** With the drawer open, Back closes it first.
- **Nothing opens twice.** Opening Chat goes back to it (`dismissTo`), as does a detail in a section already under the current one.
- **Links and notifications** open the way the sidebar does, with the section's list under a detail (`withAnchor`): a computer's thread from a notification has Chat behind it. Old addresses (`/chat/code/…`, `/desktops/<computer>/…`) redirect to `/code/…`.
- **Signed out**, Models is the root in Chat's place, and the same rules apply.

## App analytics

PostHog supports this Expo app on Android and iOS. Release builds can share app opens, screen categories and sanitized JavaScript errors after opt-in. Enable **Account → This device → App analytics → Share app usage and errors**; it is off by default and can be turned off anytime. Saved choices are preserved across updates. Development and perf builds never collect. Diagnostics stay local.

Build with `EXPO_PUBLIC_POSTHOG_KEY`, or reuse the website's public project key from `PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_KEY` or its local `.env.local`. `EXPO_PUBLIC_POSTHOG_HOST` defaults to `https://eu.i.posthog.com`; `https://us.i.posthog.com` is also supported. Use the ingestion origin, not the website's `/ingest` proxy, and never a personal API key.

In PostHog, filter events or errors by `app_surface = mobile`, then `app_version`, `app_build`, `app_os` and `screen_name`. A random ID links events across sessions on this installation without using account IDs; this is pseudonymous telemetry, not guaranteed anonymity. Prompts, responses, credentials, device names, full paths and session recordings are excluded. Messages and source context are stripped from errors, keeping only bundled-code locations. Native crashes and source-map uploads are not included; fatal JavaScript errors may be lost when the process exits. Each installation persists a cap of 200 events/day, including at most 20 errors; overall free-tier usage still depends on installation count. Opting out discards queued events.

## Layout

```
app/                 Expo Router routes
  (app)/_layout.tsx  One stack: the launch screen with a section over it; the sidebar as a drawer over it on phones, beside it on tablets
  (app)/index.tsx    `/`: redirects to Chat (signed in) or Models (signed out)
  (app)/chat/        Chat
  (app)/<section>/   Each screen's stack; SplitStack keeps the list beside the detail on tablets
  (app)/code/        A paired computer's threads, each the root of its stack, and `/code` with none open (/chat/code/* and app/desktops/<id>/* redirect here)
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

**Math in replies.** The native Markdown renderer uses its existing RaTeX engine for `$...$` inline equations and `$$` display equations. It follows the app theme, leaves currency and code literal, and keeps multiline equations together while streaming and splitting long answers. Chat requests include the delimiter guidance before any custom system prompt. Enabling math changes the native binary: rebuild the development client or APK; a JavaScript-only update cannot enable it in an older build.

The Android config preserves the display-math view during release shrinking. Version 1.1.1 of the Markdown library names the wrong package in its own consumer rule, so the app supplies the correct rule when generating the native project.

The workspace permits `react-native-enriched-markdown`'s install script to restore its native assets. After an install with scripts disabled, run `node node_modules/react-native-enriched-markdown/postinstall.mjs` from `apps/mobile` with `INIT_CWD` set to that directory before an iOS build. On Windows, put Git's `usr/bin` at the **end** of `PATH` so `unzip` is available and Windows' `tar` still handles drive-letter paths. An Expo export verifies JavaScript bundling; native iOS rendering still needs a Mac/device build.

Android builds compile `expo-sqlite` from source using Expo's autolinking setting. Its published 58.0.15 binary calls a `SharedObjectRegistry.register` signature absent from this checkout's Expo Modules v2 runtime, causing `Cannot find native module 'ExpoSQLite'` at startup. Compiling it with the app's compiler/runtime keeps those interfaces aligned.

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

iOS builds (they need an Apple Developer account and EAS Build), push notifications from a paired computer while the app is closed, model-written chat titles, and code highlighting in answers (`enriched-markdown` code highlighting is off).
