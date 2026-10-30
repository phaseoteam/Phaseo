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

Set `VITE_STATSIG_CLIENT_KEY` to your public Statsig client key when building the renderer. The `desktop_browser_suggestions` gate controls new-tab suggestions and address history suggestions. An unavailable gate or offline initialization preserves suggestions. Initialization uses an anonymous installation ID and disables event logging; server keys never belong in the renderer.

## Security boundary

Phaseo accounts support browser OAuth sign-in through the existing website consent flow. The desktop uses PKCE S256 and a random-port IPv4 loopback callback; the code exchange and gateway key stay in the main process. The key is encrypted in the credential vault, while account metadata records its expiry. Consent requests only identity, gateway access and model discovery. The existing managed-key exchange expires after seven days and requires signing in again; manual API accounts remain available for custom endpoints.

Production desktop loopback-client support and client registration were deployed on 5 October 2026 with explicit authorization. The registered public client is `phaseo_desktop`, with `http://127.0.0.1/callback` as its loopback template and `https://api.phaseo.app/v1` as the requested resource. Production checks confirmed that a valid PKCE authorization request redirects to website consent and rejects remote/incorrect callback URLs and missing PKCE. Completing user consent, issuing a real key and loading that account's model catalog still require signing in from the app.

The website consent page and decline action were subsequently corrected to accept the registered desktop callback's temporary port. The production website release is `dpl_HonrRFNFeVxB4YSzkm8zG5JeDkmk`; 21 web tests cover authenticated consent rendering, denial and callback restrictions. Start a fresh sign-in attempt after this release rather than reusing the original browser link.

Desktop model discovery reads Phaseo's native `{ ok, offset, total, models }` catalog with bounded pagination and the canonical `text.generate` capability, selecting routable, non-retired chat models. Custom endpoints continue to support OpenAI-compatible `{ data }` catalogs. The corrected loader was checked against the signed-in desktop account: 207 chat models were returned without inference or exposing its credential.

The renderer has no Node.js access. Electron runs it with context isolation, sandboxing, and navigation restrictions. A narrow preload bridge exposes validated window, application, update, runtime-information, and external-navigation commands. Filesystem, Git, terminal, credentials and agent orchestration run in the desktop runtime.

## Design reference

Desktop styles reuse the website's Montserrat assets, logo and semantic theme values. The [rendered design review](docs/design-audit.md) records spacing/layout changes and remaining validation limits. `audit:design` captures the main screens in both themes at normal and minimum window sizes using an isolated sample profile.
