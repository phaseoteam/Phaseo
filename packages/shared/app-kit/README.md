# @phaseo/app-kit

Plain TypeScript shared by Phaseo's apps: the website (`apps/web`), the desktop app (`apps/desktop`) and the mobile app (`apps/mobile`). These files used to live in the website, and the other apps reached into `apps/web` for them.

| Import | What it is |
|---|---|
| `@phaseo/app-kit/logos` | The logo list (`manifest.ts`) and `resolveLogo`, which turns an organisation or provider ID into its logo path for a theme. Also `phaseoMarkPath`, the SVG path of the Phaseo "P" mark. |
| `@phaseo/app-kit/provider-offers` | Provider display names and logo IDs for offers such as regional or fast routes. |
| `@phaseo/app-kit/gateway-status` | Gateway route statuses: normalising, ranking and choosing between them. |
| `@phaseo/app-kit/benchmarks/epoch` | Epoch AI benchmark helpers (the Capabilities Index and its confidence intervals). |

## Rules

- **No React, no app imports.** The code has to run unchanged in Next.js, Electron (Vite) and React Native (Metro). If something needs React, it belongs in the app.
- **Source, not a build.** The package exports `.ts` files, and each app compiles them with its own bundler. There is nothing to build first.
- **The website keeps its import paths.** Files such as `apps/web/src/lib/logos/index.ts` re-export from here, so the website's many importers didn't change.

## Logos

The SVG files stay in `apps/web/public/logos/`. The website serves them at `phaseo.app/logos/…`, the mobile app downloads them from there, and emails and OG cards link to them. `resolveLogo` returns those `/logos/…` paths. The desktop app bundles the same files at build time, so its logos work offline.

To add a logo:
1. Put the SVG (or its `_light`/`_dark` pair) in `apps/web/public/logos/`.
2. Add the ID to `src/logos/manifest.ts`.

Every app picks it up from there.
