# Phaseo Desktop

Phaseo Desktop organises coding and everyday AI work around chats, with optional projects and a contextual panel for files, Git, pull requests, terminals and a native browser. Accounts and harness choices remain available for each chat. See [Chats and tools](docs/chats-and-tools.md) for the current shell, verification and remaining browser capabilities.

[Phaseo skills](docs/phaseo-skills.md) documents global/project definitions, invocation policies, full-body approvals and unfinished-run recovery.

## Development

From the monorepo root:

```bash
pnpm install
pnpm --filter @phaseo/desktop dev
```

The development command builds the Electron main and preload processes, starts the Vite renderer on port `4100`, and launches Electron once the renderer is ready.

## Validation

```bash
pnpm --filter @phaseo/desktop lint
pnpm --filter @phaseo/desktop typecheck
pnpm --filter @phaseo/desktop test
pnpm --filter @phaseo/desktop build
pnpm --filter @phaseo/desktop audit:design
```

## Packaging

```bash
pnpm --filter @phaseo/desktop package
```

Electron Forge creates platform-native distributables: MSIX and ZIP on Windows, DMG and ZIP on macOS, and a Debian package on Linux. Signing credentials are intentionally supplied by release CI rather than stored in the repository.

Forge needs to crawl a physical `node_modules` tree while packaging. The repository therefore narrowly public-hoists Electron Forge packages while leaving the rest of pnpm's dependency layout unchanged.

Release builds can set `PHASEO_DESKTOP_UPDATE_URL` to enable the in-app update check. Store-managed MSIX releases receive updates through the Microsoft Store.

## Security boundary

The renderer has no Node.js access. Electron runs it with context isolation, sandboxing, and navigation restrictions. A narrow preload bridge exposes validated window, application, update, runtime-information, and external-navigation commands. Filesystem, Git, terminal, credentials and agent orchestration run in the desktop runtime.

## Design reference

Desktop styles reuse the website's Montserrat assets, logo and semantic theme values. The [rendered design review](docs/design-audit.md) records spacing/layout changes and remaining validation limits. `audit:design` captures the main screens in both themes at normal and minimum window sizes using an isolated sample profile.
