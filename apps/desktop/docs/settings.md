# Settings

Settings is a full page. The sidebar becomes its navigation, with a search box that filters pages by name and by what they contain.

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
