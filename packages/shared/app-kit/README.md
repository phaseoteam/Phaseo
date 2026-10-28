# @phaseo/app-kit

Plain TypeScript shared by Phaseo's apps: the website (`apps/web`), the desktop app (`apps/desktop`) and the mobile app (`apps/mobile`). These files used to live in the website, and the other apps reached into `apps/web` for them.

| Import | What it is |
|---|---|
| `@phaseo/app-kit/logos` | The logo list (`manifest.ts`) and `resolveLogo`, which turns an organisation or provider ID into its logo path for a theme. |
| `@phaseo/app-kit/provider-offers` | Provider display names and logo IDs for offers such as regional or fast routes. |
| `@phaseo/app-kit/gateway-status` | Gateway route statuses: normalising, ranking and choosing between them. |
| `@phaseo/app-kit/benchmarks/epoch` | Epoch AI benchmark helpers (the Capabilities Index and its confidence intervals). |
| `@phaseo/app-kit/theme` | Design tokens: the theme model (palettes, accents, presets, swatches), each palette's colours, the status colours, the chart mixes and the radius scale, plus the colour maths below. |
| `@phaseo/app-kit/theme/colour` | Colour maths: hex, HSV, OKLCH, WCAG contrast, `mixOklch` (CSS `color-mix(in oklch, …)`) and `readableForegroundForAccent`. |

## Rules

- **No React, no app imports.** The code has to run unchanged in Next.js, Electron (Vite) and React Native (Metro). If something needs React, it belongs in the app.
- **Source, not a build.** The package exports `.ts` files, and each app compiles them with its own bundler. There is nothing to build first.
- **Plain Node can load the token data.** `src/theme/tokens.ts` and `src/theme/colour.ts` import nothing, so `node --experimental-strip-types` can read them without a build or dependencies (the drift test does).
- **The website keeps its import paths.** Files such as `apps/web/src/lib/logos/index.ts` re-export from here, so the website's many importers didn't change.

## Logos

The SVG files stay in `apps/web/public/logos/`. The website serves them at `phaseo.app/logos/…`, the mobile app downloads them from there, and emails and OG cards link to them. `resolveLogo` returns those `/logos/…` paths. The desktop app bundles the same files at build time, so its logos work offline.

To add a logo:
1. Put the SVG (or its `_light`/`_dark` pair) in `apps/web/public/logos/`.
2. Add the ID to `src/logos/manifest.ts`.

Every app picks it up from there.

## Theme tokens

`src/theme/tokens.ts` is the one place the theme's values are written down. The apps use them like this:

| App | Where the tokens are | How they follow tokens.ts |
|---|---|---|
| Website | `apps/web/src/app/globals.css` (`:root`, `.dark`, the palette blocks, the accent blocks); the Appearance settings read the presets and swatches from here | Drift test |
| Desktop app | `apps/desktop/src/renderer/index.css` (`:root`, `.dark`) | Drift test |
| Factory | `apps/factory/src/renderer/index.css` (`:root`, `.dark`) | Drift test |
| Mobile app | `apps/mobile/global.css` (the Phaseo theme before launch), then `src/lib/theme/model.ts` at runtime | Imports this package; drift test for global.css |

The drift test, `test/theme.test.mjs`, reads each app's CSS and checks every shared token it declares against tokens.ts. Differences on purpose are listed in the test with their current value. Run it with `pnpm --filter @phaseo/app-kit test` or `pnpm run validate:theme-tokens` (CI runs the latter in Repository checks).

To change a token, change tokens.ts and the same value in each app's CSS; the test tells you which ones are left.
