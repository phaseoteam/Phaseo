# Desktop Studio

Desktop-only local-first AI chat + coding workspace built with Electron + React.

## Features

- Chat mode with local session persistence.
- Code mode with workspace picker, file browser, Monaco editor, and save flow.
- Built-in command runner with output streaming and safety policy blocking destructive commands.
- Provider abstraction with mock mode and OpenAI-compatible endpoint mode.

## Run

```bash
pnpm install
pnpm desktop:dev
```

## Build

```bash
pnpm desktop:build
pnpm --filter @ai-stats/desktop-studio build:dist
```

## Security Notes

- Commands like `rm -rf`, `git reset --hard`, and system shutdown/format patterns are blocked.
- Renderer uses `contextIsolation: true`, `nodeIntegration: false`, and a typed preload bridge.
- API keys are stored locally in app state for now; move to OS keychain before production.
