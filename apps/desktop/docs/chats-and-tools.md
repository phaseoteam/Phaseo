# Chats and contextual tools

Chats are the desktop workspace's primary navigation. Each chat can be personal or associated with a project; the bounded history projection carries the optional project ID without returning conversation bodies. Search, pinning, archives and pagination remain available in the single left sidebar.

The centre keeps the selected conversation mounted while opening tools and settings. Message drafts and history position survive those interactions. Accounts, agents, MCP connections and schedules live under Settings; Inbox and the existing Platform surface remain available from the sidebar footer.

Files & Git, pull requests, terminal and Browser share a collapsible right panel. Selecting a different chat initializes project tools from its project. Personal chats start without a project. Terminal lists follow that context; file drafts from another project are not restored into the current project's editor. At narrower widths the tools overlay the conversation and can be dismissed without losing it.

## Native browser

The Browser uses Electron WebContentsView, with up to twenty tabs per chat, navigation, back/forward, reload/stop and independent native history for each tab during the app session. Tab titles, addresses and active selection are saved locally; fresh native surfaces restore those addresses. Closing a tab disposes its remote web contents; closing the last tab opens a blank replacement. Tab selection supports arrow keys, Home and End. A dedicated persistent browser partition stores website sessions separately from the app and provider credentials. Closing the panel hides the surface; reopening restores it. App shutdown disposes the remote web contents.

Remote pages have no preload, Node integration or workspace bridge. HTTP/HTTPS addresses, including local development servers, are supported. File/data/custom protocol navigation and embedded URL credentials are rejected. Main IPC requires the application's own main-frame web contents, including when another native surface belongs to its window. Native surfaces hide for app dialogs and menus, and their bounds follow the host panel and zoom.

This is an initial browser surface, not full browser parity. Website permission prompts, durable browser history and remote preview routing remain to implement. Website permission requests currently return false. HTTP/HTTPS popup links open a tab in the current chat; background-tab requests retain the active tab and load when selected. Inactive native surfaces cannot request popups into another chat.

## Verification

`pnpm --filter @phaseo/desktop audit:design` runs the new chat-shell smoke/audit. It uses an isolated local profile, two seeded conversations and a local HTTP site, with no provider inference. It verifies grouping, drafts, settings, project PR/terminal context, native navigation/history, chat-specific browser restoration, unsafe-address rejection, remote privilege isolation, bounds, modal hiding and cleanup.

Source and Windows archive runs produce 16 shell captures across light/dark themes at 1440×920 and 1040×680, plus multiple-tab, phone-preview and downloads captures, two separate native browser page captures and four pull-request-detail captures. Electron's host `capturePage` does not include the separate WebContentsView pixels; the native page is captured directly and is not composited into the shell screenshot.

The broader source/archive desktop smoke covers existing accounts, agents, MCP, schedules, attachments, Git, worktrees, notifications and native protocol fixtures through the new public navigation. Provider fixtures do not establish signed-in live inference or complete product parity. Multi-OS rendering, scaling and assistive-technology verification remain open.

Tab workflows verify independent native surfaces/history, keyboard selection, disposal, fresh-surface address restoration and last-tab replacement. Renderer reload hides existing native surfaces before the new shell loads. Owned native window.open and Ctrl-click workflows verify foreground/background tab delivery, source-history preservation, unsafe-popup rejection, remote privilege isolation and disposal. Twenty tabs created through the UI verify the admission limit, readable error, recovery after closing a tab and active-tab visibility. The audit fails on unexpected unhandled promise rejections. Blank-window/opener-dependent authentication flows remain unverified.

[Browser tab controls](screenshots/browser-tabs-desktop.png) show the host chrome; the separate native page capture contains the website pixels.

## Developer tools

The selected browser tab can open Electron’s native detached inspector from the toolbar, F12, Ctrl+Shift+I or Cmd+Alt+I. Native open/closed events update the button state. The inspector targets that website web contents; the app renderer is not inspected. Closing the tab disposes its inspector. Owned source/archive workflows verify toolbar toggling, native Windows keyboard input, external inspector closure, selected-target isolation and disposal. macOS shortcuts and complete developer-tool workflows remain unverified.

## Responsive previews

Each browser tab saves its Desktop, Phone or Tablet preview. Phone uses 390×844 and Tablet uses 768×1024 CSS pixels; Rotate swaps the dimensions. The native view fits and centres inside the available panel. Choosing a preview before entering an address is supported: emulation starts when the document is ready.

Source and Windows archive checks verify actual native page and screen dimensions in both orientations, modal dismissal and panel restoration, and rejection of invalid modes. These are Chromium viewport previews; physical-device fidelity, touch, custom dimensions and device-specific user agents remain unverified.

![Owned loopback page in Phone preview](screenshots/browser-phone-page.png)

## Downloads

Downloads use [Electron’s native save workflow](https://www.electronjs.org/docs/latest/api/download-item) and appear in their originating chat’s Browser panel. The list shows bytes and state, Pause/Resume, Cancel, Show in folder and Remove. Removing a record leaves the saved file intact. Only confirmed native download paths can be revealed. Active transfers continue when the panel is hidden; owner-window shutdown cancels them. The app bounds concurrent transfers to twenty and keeps up to one hundred records, pruning finished entries first. A rejected transfer reports the limit in its record.

Owned source and Windows archive workflows use temporary save destinations, verify exact saved bytes, pause/resume/cancel, chat isolation and removal, and confirm the native page hides behind the downloads list. Five deterministic cases cover progress, completion, owner isolation, action guards, bounds, limit feedback and shutdown. The native save-dialog interaction and operating-system folder UI remain unverified. Download records are stored in the workspace SQLite database and survive app restarts. Unfinished records recover as terminal interruptions; automatic transfer resumption across restarts remains open.

![Downloads](screenshots/browser-downloads.png)

`pnpm --filter @phaseo/desktop test:downloads` runs three separate Electron processes against an isolated profile: download, reopen and remove its record, then reopen again. Source and Windows archive runs verify retained native paths, exact saved bytes and durable removal without deleting the file. SQLite reopening tests cover interrupted-state recovery and a one-hundred-record bound that preserves active transfers. Progress writes are limited to once per second; final states and control changes save immediately. Write failures report that history may not survive a restart, and failed removal retains the visible record. Windows CI repeats both restart audits.

## Pull-request details

Select a pull-request title to open its description, branches, commit, changed-file totals, state, check/review summary and conflict status inside the right panel. Back restores the list page and focus. Detail refresh retains confirmed content on failure, provides Retry and ignores late results after changing projects. Visible details use the same 45/60-second refresh policy as lists. GitHub remains available as a separate action.

The production adapter reads a project’s GitHub origin through a compact native CLI GraphQL query with validated numbers, bounded output and canonical links. An installed-CLI read of PR #2702 verifies real body and commit metadata. Source and Windows archive audits cover failure/retry, retained-body refresh, Markdown isolation, Back focus and stale project responses, with light/dark captures at both window sizes. Changed-file diffs, review threads/actions, merge and background watchers remain open.

![Pull-request details](screenshots/pull-request-details-small-window.png)

Live native tabs now retain their configured viewport when the tools panel remounts, even if an immediate rotate/close leaves older saved metadata. Saved preview settings apply only to a fresh unconfigured surface. Source/archive regression checks reproduce the former portrait reversion and verify both live landscape preservation and fresh phone restoration. `pnpm --filter @phaseo/desktop test:browser-viewport` runs 96 native geometry cases across four device orientations, eight fractional panel sizes and app zoom factors of 1, 1.25 and 1.5; it verifies exact page/screen dimensions, containment and centring. The evidence is written to `output/playwright/browser-viewport/geometry.json` and uploaded by Windows CI. Physical display scaling and other operating systems remain unverified.
