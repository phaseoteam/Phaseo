# Chats and contextual tools

Chats are the desktop workspace's primary navigation. Each chat can be personal or associated with a project; the bounded history projection carries the optional project ID without returning conversation bodies. Search, pinning, archives and pagination remain available in the single left sidebar.

The centre keeps the selected conversation mounted while opening tools and settings. Message drafts and history position survive those interactions. Accounts, agents, MCP connections and schedules live under Settings; Inbox and the existing Platform surface remain available from the sidebar footer.

Files & Git, pull requests, terminal and Browser share a collapsible right panel. Selecting a different chat initializes project tools from its project. Personal chats start without a project. Terminal lists follow that context; file drafts from another project are not restored into the current project's editor. At narrower widths the tools overlay the conversation and can be dismissed without losing it.

## Native browser

The Browser uses Electron WebContentsView, with up to twenty tabs per chat, navigation, back/forward, reload/stop and independent native history for each tab during the app session. Tab titles, addresses and active selection are saved locally; fresh native surfaces restore those addresses. Closing a tab disposes its remote web contents; closing the last tab opens a blank replacement. Tab selection supports arrow keys, Home and End. A dedicated persistent browser partition stores website sessions separately from the app and provider credentials. Closing the panel hides the surface; reopening restores it. App shutdown disposes the remote web contents.

Remote pages have no preload, Node integration or workspace bridge. HTTP/HTTPS addresses, including local development servers, are supported. File/data/custom protocol navigation and embedded URL credentials are rejected. Main IPC requires the application's own main-frame web contents, including when another native surface belongs to its window. Native surfaces hide for app dialogs and menus, and their bounds follow the host panel and zoom.

This is an initial browser surface, not full browser parity. Managed downloads, website permission prompts, responsive device previews, developer tools, durable browser history and remote preview routing remain to implement. Website permission requests currently return false; popup links navigate the current browser surface.

## Verification

`pnpm --filter @phaseo/desktop audit:design` runs the new chat-shell smoke/audit. It uses an isolated local profile, two seeded conversations and a local HTTP site, with no provider inference. It verifies grouping, drafts, settings, project PR/terminal context, native navigation/history, chat-specific browser restoration, unsafe-address rejection, remote privilege isolation, bounds, modal hiding and cleanup.

Source and Windows archive runs produce 16 shell captures across light/dark themes at 1440×920 and 1040×680, plus an additional multiple-tab capture and a separate native browser page capture. Electron's host `capturePage` does not include the separate WebContentsView pixels; the native page is captured directly and is not composited into the shell screenshot.

The broader source/archive desktop smoke covers existing accounts, agents, MCP, schedules, attachments, Git, worktrees, notifications and native protocol fixtures through the new public navigation. Provider fixtures do not establish signed-in live inference or complete product parity. Multi-OS rendering, scaling and assistive-technology verification remain open.

Tab workflows verify independent native surfaces/history, keyboard selection, disposal, fresh-surface address restoration and last-tab replacement. Renderer reload hides existing native surfaces before the new shell loads. Popup links currently navigate the active tab; popup-to-tab delivery remains open.

[Browser tab controls](screenshots/browser-tabs-desktop.png) show the host chrome; the separate native page capture contains the website pixels.
