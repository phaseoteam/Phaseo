# @phaseo/app-kit

Plain TypeScript shared by Phaseo's apps: the website (`apps/web`), the desktop app (`apps/desktop`) and the mobile app (`apps/mobile`). These files used to live in the website, and the other apps reached into `apps/web` for them.

| Import | What it is |
|---|---|
| `@phaseo/app-kit/logos` | The logo list (`manifest.ts`) and `resolveLogo`, which turns an organisation or provider ID into its logo path for a theme. |
| `@phaseo/app-kit/provider-offers` | Provider display names and logo IDs for offers such as regional or fast routes. |
| `@phaseo/app-kit/gateway-status` | Gateway route statuses: normalising, ranking and choosing between them. |
| `@phaseo/app-kit/benchmarks/epoch` | Epoch AI benchmark helpers (the Capabilities Index and its confidence intervals). |
| `@phaseo/app-kit/theme` | Design tokens: the theme model (palettes, accents, presets, swatches), each palette's colours, the status colours, the chart mixes and the radius scale. Also `themeVariables`, a theme's colours as CSS variables (the mobile app applies them), and the colour maths below. |
| `@phaseo/app-kit/theme/colour` | Colour maths: hex, HSV, OKLCH, WCAG contrast, `mixOklch` (CSS `color-mix(in oklch, …)`) and `readableForegroundForAccent`. |

## Rules

- **No React, no app imports.** The code has to run unchanged in Next.js, Electron (Vite) and React Native (Metro). If something needs React, it belongs in the app.
- **Source, not a build.** The package exports `.ts` files, and each app compiles them with its own bundler. There is nothing to build first.
- **Plain Node can load the theme.** `src/theme/tokens.ts` and `src/theme/colour.ts` import nothing, so `node --experimental-strip-types` reads them without a build or dependencies (the drift test does). `scripts/sync-theme-tokens.mjs` also loads `variables.ts`, retrying its extensionless imports with `.ts`.
- **The website keeps its import paths.** Files such as `apps/web/src/lib/logos/index.ts` re-export from here, so the website's many importers didn't change.

## Logos

The SVG files stay in `apps/web/public/logos/`. The website serves them at `phaseo.app/logos/…`, the mobile app downloads them from there, and emails and OG cards link to them. `resolveLogo` returns those `/logos/…` paths. The desktop app bundles the same files at build time, so its logos work offline.

To add a logo:
1. Put the SVG (or its `_light`/`_dark` pair) in `apps/web/public/logos/`.
2. Add the ID to `src/logos/manifest.ts`.

Every app picks it up from there.

## Theme tokens

`src/theme/tokens.ts` is the one place the theme's values are written down. `scripts/sync-theme-tokens.mjs` writes them into each app:

| App | Generated | Hand-written, checked by the drift test |
|---|---|---|
| Website | `apps/web/src/app/theme-tokens.generated.css` (imported by `globals.css`): `:root`, `.dark` and the palette blocks | `globals.css`: the accent blocks (primary, ring and charts from the user's accent) and the radius scale. The Appearance settings read the presets and swatches from this package. |
| Desktop app | `apps/desktop/src/renderer/theme-tokens.generated.css` (imported by `index.css`) | `index.css`: the radius scale |
| Factory | `apps/factory/src/renderer/theme-tokens.generated.css` (imported by `index.css`) | `index.css`: the radius scale |
| Mobile app | The `@layer theme` block of `apps/mobile/global.css`, between "Generated from" and "End of generated tokens" (Uniwind reads that file itself, so it isn't an import) | `@theme`: the radii. At runtime `src/lib/theme/model.ts` applies the chosen theme with `themeVariables`. |

To change a token, edit tokens.ts and run `pnpm run theme:sync-tokens`. Don't edit the generated CSS.

`pnpm run validate:theme-tokens` runs in CI's Repository checks, before dependencies are installed. It fails if a generated file is out of date (`sync-theme-tokens.mjs --check`), then runs the drift test, `test/theme.test.mjs` (also `pnpm --filter @phaseo/app-kit test`). The drift test reads each app's CSS, generated and hand-written together. It checks every shared token against tokens.ts and fails if hand-written CSS declares a generated token again. Differences on purpose are listed in the test with their current value.
