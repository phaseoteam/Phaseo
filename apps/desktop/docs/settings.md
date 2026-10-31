# Settings

Settings is a full page. The sidebar becomes its navigation, with a search box that filters pages by name and by what they contain.

## Version and updates

**Settings → General → About** shows the app version, with the commit it was built from when the build knew it, and **Copy** puts `Phaseo <version>` on the clipboard for a bug report. Its **Updates** row says what the last check found (or that nothing has been checked since Phaseo started) and has **Check for updates**. When an update has downloaded, a toast says so, **Restart to update** shows in the title bar beside the menu, and the About row offers it too.

## Code chats

**Settings → General → Pull requests** has T3 Code's **Open pull requests in Phaseo** (on by default: pull request links in chats open in the pull request pane, and Ctrl-click, ⌘-click or middle-click opens them on GitHub; off, they open like any other link) and **Default merge method** (Last selected, Merge, Squash and merge, or Rebase and merge; a project can choose its own in Project settings). **Settings → General → Panes → Default diff file state** starts the Diff and a pull request's Code tab with files expanded or collapsed.

**Settings → General → Worktrees** holds T3 Code's worktree cleanup rules for the worktrees Phaseo makes: remove one when its pull request merged at its current commit, when it has no commits beyond the default branch, when no chat has used it for a day, after every chat in it has been settled or archived for a number of days (7 by default), or after it has been inactive for a number of days (30 by default). A worktree is always kept while it has any uncommitted change or untracked file, has commits that are on no remote (unless GitHub merged exactly that commit), has a running chat, a queued message, an open terminal or a Git action, has worktrees started from it, or is on a different branch from the one it was made with. **Clean up automatically** (off by default) applies the rules at startup and every six hours. **Clean up now** lists what the rules would remove and what they keep, with the reason for each, and removes nothing until you confirm; each worktree is checked again just before it goes. Removing a worktree deletes its checkout and ignored files; the branch and the chats stay. The last run's result is shown until the app quits.

**Settings → General → Code chats** sets when Code chats settle on their own (merged pull requests, keeping chats that have one, and days without activity) and **Show a Working section**, which folds working chats into a Working section above Snoozed (off by default, kept per window). Each project can change the auto-settle settings in its own **Project settings**.

## Project settings

Each project has a page under **Projects** in the settings sidebar, also opened from a Code chat's menu, the chat header and the project menu. It holds the project's name and icon (a Lucide icon with a colour, an emoji or a monogram, as in T3 Code; an automatic monogram until you choose), its auto-settle settings (each follows General until changed), its actions (with when each runs on its own, a shortcut and a preview URL, and scripts to import from the checkout's `t3.json`) and **Remove project**, which deletes the project entry and its chats but never files on disk. Worktrees use their project's page. Settings are stored with the project in the workspace database and checked by the app before they are saved.

## Usage and limits

**Usage & limits** reads each subscription's plan and limit windows when the page opens, and again on **Check again**. Each check starts the agent briefly; nothing is sent to a model.

- **Codex**: the 5-hour and weekly windows from the Codex app server (`account/rateLimits/read`), and the ChatGPT plan.
- **Claude Code**: the 5-hour and weekly windows, per-model weekly windows and extra usage, from the Agent SDK's usage call (the data behind Claude Code's `/usage`). Logins made with a long-lived token (`claude setup-token`), API keys and cloud providers have no plan limits to read; a normal `/login` sign-in does.
- Typing `/usage` in a Codex or Claude chat shows that chat's limits above the composer.

On Windows, Codex installed with npm is started from its bundled `codex.exe` rather than its `codex.js` launcher, which would otherwise open a console window for every check or run.

### Usage hubs

A usage hub is a [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) server that holds many accounts. If T3 Code on this computer already has hubs, **Import from T3 Code** copies them, reading each management key from T3 Code's local secret store. Otherwise add one with its address and management key; Phaseo lists its accounts once to check the key before saving it. The key is kept in the device's secure credential storage, never in settings files.

For every Codex and Claude account on the hub that isn't disabled, Phaseo asks the hub to call the provider's own usage endpoint with that account's token (`POST /v0/management/api-call`): ChatGPT's `wham/usage` and Anthropic's `oauth/usage`. Accounts for other providers are counted but not read. Claude accounts that list their windows only in `limits[]` (a `session` window and per-model `weekly_scoped` windows, with `seven_day` empty) are read from there. Errors are specific: a rejected key, management access refused (turn on `allow-remote` for a hub on another computer), no management API, or a hub that can't be reached. CLIProxyAPI blocks an address for 30 minutes after five wrong keys.

## Notifications

**Settings → Notifications → Desktop alerts** sends a system notification when a chat needs you (Needs attention) or for every update, while Phaseo is in the background; **Show chat titles** names the chat in them. Under **In the app**, **In-app notices** (on by default) shows a toast while Phaseo has focus when a chat other than the open one finishes or needs you, with **Open**; several at once become one toast. **Unread count on the app icon** (on by default) counts chats with an unread reply or a request waiting on you on the dock (macOS), the launcher (Linux) or the taskbar button (Windows, as a small badge).

## Appearance

Choose System, Light or Dark, and a colour theme. Every theme has a light and a dark side. The built-ins are Phaseo, themes inspired by ChatGPT, Codex, Claude, Gemini, Grok, Mistral and Perplexity (approximations of their palettes, not official ones), and Graphite.

**New theme** starts from the current theme: pick a background and an accent for each side, and the app previews the result as you edit. Other colours are derived from those two. A theme can be exported as a `.phaseo-theme.json` file or copied as a one-line `phaseo-theme:` share code; **Import** takes either, as well as T3 Code theme files and VS Code colour themes.

## Keyboard shortcuts

**Settings → Keyboard shortcuts** lists every shortcut by area (General, Chats, Composer, Panes, Browser, Pull requests, View, and Project actions), as T3 Code does. Click a shortcut and press new keys to change it, then Save; Escape cancels and Backspace leaves it unassigned. Each shortcut can have a **When** condition built from `chatMode`, `codeMode`, `chatOpen`, `paneOpen`, `settingsOpen`, `textFocused`, `composerFocused` and `terminalFocused` with `&&`, `||`, `!` and brackets; it runs only while the condition holds. A warning marks keys used by another command. The row menu resets a changed shortcut to its default or removes it, and **Add keybinding** gives a command an extra shortcut. **Project actions** lists every project action (see Project settings) with its shortcut, if it has one; an action's shortcut is saved as `script.<project id>.<action id>.run` and works only while a chat in that project is open, so different projects' actions may share keys without a warning.

Changes are saved in `keybindings.json` in the app's settings folder (the file button opens it). It is a list of `{ "command", "key", "when" }` entries: a command listed there uses those keys instead of its defaults, and an empty key unassigns it. Edits made by hand apply straight away; if the file cannot be read, the defaults stay in use and the page says why. Menus and tooltips show the keys currently bound.

Among the defaults: `F6` and `Shift+F6` (also with `Ctrl`/`⌘`) move focus between the sidebar, the conversation, the message box and the right pane; `Ctrl+Shift+M` opens the model picker; `Ctrl+Shift+P` pins or unpins the open chat; `Ctrl+Shift+C` copies its ID (on a pull request it copies the pull request's link instead); `Ctrl+U` opens Usage; `Ctrl+Alt+A` opens Appearance to choose a theme; and `Ctrl+Alt+N` starts a chat without a project, in Chat. On macOS, `⌘` replaces `Ctrl`.

## Message box

**Settings → General → Message box → Send with** chooses Enter (Shift+Enter adds a line) or Ctrl+Enter / ⌘Enter (Enter adds a line), as T3 Code's send shortcut does. It is kept on this device. With Enter chosen, `Ctrl+Enter` (`⌘Enter`) while a turn runs sends into that turn instead of queueing. The message box's other keys (send into the running turn, edit the last queued message, send and start a new chat, prompt history and stash) are under **Composer** in Keyboard shortcuts.

## Chat titles

**Settings → General → Chat titles** chooses how new chats are named: after their first message (the default), or written by a model, as T3 Code does. With a model, pick a Phaseo model under **Title model**; each new chat is named from its first message through your Phaseo account (a small request per chat), unless you rename it first. **Regenerate title** in a chat's menu writes a new title from the first message and the latest reply.

## Diagnostics

**Settings → Diagnostics**, under **Advanced** at the bottom of the settings sidebar (also in the command palette), is T3 Code's diagnostics page for this app. Everything on it stays on this computer.

- **Live processes**: Phaseo's main process and everything below it: its windows, browser tabs and Electron helpers, agent CLIs, terminals (named after the terminal and its chat), Git and MCP servers. Each row shows CPU, memory, process ID, how long it has run and its command line; a chevron folds a process's children away. The stop button ends a process Phaseo started, after you confirm. Phaseo first checks again that the process ID still belongs to the same process (by its start time) and is still below Phaseo; if not, it says the process already exited. The main process and Electron's own processes cannot be stopped here.
- **Resource history**: CPU time, average and peak CPU and peak memory for each process over the last 5, 15 or 30 minutes or hour, with bars for the whole app and for each process. Processes are sampled only while this page is open (every 5 seconds on Windows, 3 elsewhere) or when it is refreshed. Samples are kept in memory only, for at most an hour, at most 1,800 samples and about 8 MB, and are forgotten when Phaseo quits. With the page closed nothing reads the process table.
- **Trace diagnostics** and the tables below it read the main process's trace file: counts of spans, failures, slow spans (a second or longer) and unreadable lines; the latest 20 failures; the 10 most common failures; the 10 slowest spans; the latest 20 warnings and errors (from spans and from the main process's console); and the 10 most frequent span names with their total, average and longest time.

Traces are written to `logs/traces.ndjson` in the app's data folder (**Open logs folder** opens it), one JSON line per span, in batches about once a second. At 10 MB the file is renamed to `traces.ndjson.1` (and that one to `.2`), so at most 30 MB is kept. Spans cover chat turns and their set-up, workspace commands, model catalogue fetches, credential reads (never their values), Git snapshots and diffs, GitHub CLI calls, MCP start-up, file search, chat titles and scheduled tasks; other requests from the window, and database writes, are recorded only when they take 50 ms or more or fail. Common token formats are hidden from messages before they are written.
