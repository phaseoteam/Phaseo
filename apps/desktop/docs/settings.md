# Settings

Settings is a full page. The sidebar becomes its navigation, with a search box that filters pages by name and by what they contain.

## Code chats

**Settings → General → Pull requests** has T3 Code's **Open pull requests in Phaseo** (on by default: pull request links in chats open in the pull request pane, and Ctrl-click, ⌘-click or middle-click opens them on GitHub; off, they open like any other link) and **Default merge method** (Last selected, Merge, Squash and merge, or Rebase and merge; a project can choose its own in Project settings). **Settings → General → Panes → Default diff file state** starts the Diff and a pull request's Code tab with files expanded or collapsed.

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

## Appearance

Choose System, Light or Dark, and a colour theme. Every theme has a light and a dark side. The built-ins are Phaseo, themes inspired by ChatGPT, Codex, Claude, Gemini, Grok, Mistral and Perplexity (approximations of their palettes, not official ones), and Graphite.

**New theme** starts from the current theme: pick a background and an accent for each side, and the app previews the result as you edit. Other colours are derived from those two. A theme can be exported as a `.phaseo-theme.json` file or copied as a one-line `phaseo-theme:` share code; **Import** takes either, as well as T3 Code theme files and VS Code colour themes.

## Keyboard shortcuts

**Settings → Keyboard shortcuts** lists every shortcut by area (General, Chats, Panes, Browser, Pull requests, View, and Project actions), as T3 Code does. Click a shortcut and press new keys to change it, then Save; Escape cancels and Backspace leaves it unassigned. Each shortcut can have a **When** condition built from `chatMode`, `codeMode`, `chatOpen`, `paneOpen`, `settingsOpen`, `textFocused` and `terminalFocused` with `&&`, `||`, `!` and brackets; it runs only while the condition holds. A warning marks keys used by another command. The row menu resets a changed shortcut to its default or removes it, and **Add keybinding** gives a command an extra shortcut. **Project actions** lists every project action (see Project settings) with its shortcut, if it has one; an action's shortcut is saved as `script.<project id>.<action id>.run` and works only while a chat in that project is open, so different projects' actions may share keys without a warning.

Changes are saved in `keybindings.json` in the app's settings folder (the file button opens it). It is a list of `{ "command", "key", "when" }` entries: a command listed there uses those keys instead of its defaults, and an empty key unassigns it. Edits made by hand apply straight away; if the file cannot be read, the defaults stay in use and the page says why. Menus and tooltips show the keys currently bound.

## Chat titles

**Settings → General → Chat titles** chooses how new chats are named: after their first message (the default), or written by a model, as T3 Code does. With a model, pick a Phaseo model under **Title model**; each new chat is named from its first message through your Phaseo account (a small request per chat), unless you rename it first. **Regenerate title** in a chat's menu writes a new title from the first message and the latest reply.
