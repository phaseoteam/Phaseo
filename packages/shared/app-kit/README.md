# @phaseo/app-kit

Plain TypeScript shared by Phaseo's apps: the website (`apps/web`), the desktop app (`apps/desktop`), the mobile app (`apps/mobile`) and Factory (`apps/factory`). These files used to live in the website, and the other apps reached into `apps/web` for them.

| Import | What it is |
|---|---|
| `@phaseo/app-kit/logos` | The logo list (`manifest.ts`) and `resolveLogo`, which turns an organisation or provider ID into its logo path for a theme. Also `phaseoMarkPath`, the SVG path of the Phaseo "P" mark. |
| `@phaseo/app-kit/provider-offers` | Provider display names and logo IDs for offers such as regional or fast routes. |
| `@phaseo/app-kit/gateway-status` | Gateway route statuses: normalising, ranking and choosing between them. |
| `@phaseo/app-kit/benchmarks/epoch` | Epoch AI benchmark helpers (the Capabilities Index and its confidence intervals). |
| `@phaseo/app-kit/theme` | Design tokens: the theme model (palettes, accents, presets, swatches), each palette's colours, the status colours, the chart mixes and the radius scale. Also `themeVariables`, a theme's colours as CSS variables (the mobile app applies them), and the colour maths below. |
| `@phaseo/app-kit/ui-recipes` | Class recipes: plain Tailwind class strings the website and the mobile app (Uniwind) both understand. Callout tones, badge tones and the mobile type scale. |
| `@phaseo/app-kit/theme/colour` | Colour maths: hex, HSV, OKLCH, WCAG contrast, `mixOklch` (CSS `color-mix(in oklch, …)`) and `readableForegroundForAccent`. |
| `@phaseo/app-kit/format` | Display formatters: money, counts, speed, latency, token limits, durations, dates and times, relative times and the usage dashboard's figures. |

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

## Class recipes

`src/ui-recipes/` holds class strings that work in both Tailwind 4 (the website) and Uniwind (the mobile app), so the two draw a component the same way:

| Recipe | File | Used by |
|---|---|---|
| `CALLOUT_TONES`: the callout's tones (`surface`, `title`, `description`) | `callout.ts` | The website's `components/ui/callout.tsx` and the mobile app's `components/ui/callout.tsx` |
| `BADGE_TONES` | `badge.ts` | The mobile app's `Badge` |
| `TEXT_VARIANTS`: the mobile type scale | `text.ts` | The mobile app's `Text` |

Rules for a recipe:
- **Only classes both apps understand.** No `has-*`, no arbitrary selectors such as `[&_svg]`, no `color-mix`.
- **Keep surface and text classes apart**, because React Native text doesn't inherit its container's colour.
- **One file per recipe, listed with `@source` by each app that uses it.** Tailwind only generates classes it finds in the files it scans, and this package is outside the apps. The website lists `ui-recipes/callout.ts` in `globals.css`; the mobile app lists the whole folder in `global.css`. Without that line the classes silently disappear.

## Formatters

The website is the reference. Each formatter is the website's own style for that kind of figure, so a figure reads the same in every app:

| Figure | Formatter | Looks like | Website original |
|---|---|---|---|
| A balance, spend, budget or usage total | `formatUsd` | $0.00 · $0.0035 · $12.50 · $1,234.50 | The budgets pages (`useSpendUsd`) |
| What one request, message or chat cost | `formatUsdCost` | $0 · $0.00004 · $0.1234 · $0.5 | Chat message costs |
| A unit price, such as per million tokens | `formatUsdPrice` | $0.035 · $2.5 · $1,234.5 | The /models list |
| A model's headline price per million tokens | `formatUsdHeadlinePrice` | $0.0035 · $0.50 · $15 | The /models card headline |
| A count of tokens or requests | `formatRoundedCount` | 999 · 1.15K · 1.23M (rounded down) | Rankings and usage |
| Output speed | `formatTps` | 45.3 tps · 123 tps | The model page's providers |
| A latency: time to first token, end-to-end, how long a response took | `formatLatency` | 0.85 s · 12.3 s · 16.7 min | The model page's providers. Overhead-like timings stay in ms |
| A context window or other token limit | `formatTokenCount`, or `formatTokenCountShort` where space is tight | 131,072 tokens · 131K | /models cards; page titles (`formatContextLength`) |
| How long a piece of work took, such as an agent's turn | `formatDuration` | 850 ms · 1.5 s · 2.08 min | The chat's old timings |
| Spend, counts, shares and changes on the usage dashboard | `formatUsageUsd`, `formatUsageNumber`, `formatUsagePercent`, `usageDeltaPercent` | $1,234 · 1.2M · 12.3% | The usage dashboard (moved) |
| A date | `formatDate`, or `formatCalendarDate` for a release date (UTC) | 29 Oct 2026 | Dates (`formatDisplayDate`) |
| A time of day, or a date and time | `formatTime`, `formatDateTime` | 14:05 · 29 Oct 2026, 14:05 | `formatDisplayTime`, `formatDisplayDateTime` |
| A time that may be recent | `formatTimestamp` | 3 hours ago, then 29 Oct 2026, 14:05 | `formatDisplayTimestamp` |
| A time | `formatRelativeTime` | now · 5 minutes ago · yesterday | Timestamps |
| A time in a narrow list | `formatAgoShort` | now · 5m · 3h · 2d | None: the same units, abbreviated |

Money always uses `MONEY_LOCALE` (`en-US`), so it shows `$12.50` and never `US$12.50`. Dates and times use `DATE_LOCALE` (`en-GB`), the website's default language; `formatDateParts` takes any other Intl options. They give the same text without `dateStyle` or `Intl.RelativeTimeFormat`, which Hermes (the mobile app's engine) may lack. Tests: `pnpm --filter @phaseo/app-kit test`.
