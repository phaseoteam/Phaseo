# @phaseo/app-kit

Plain TypeScript shared by Phaseo's apps: the website (`apps/web`), the desktop app (`apps/desktop`), the mobile app (`apps/mobile`) and Factory (`apps/factory`). These files used to live in the website, and the other apps reached into `apps/web` for them.

| Import | What it is |
|---|---|
| `@phaseo/app-kit/logos` | The logo list (`manifest.ts`) and `resolveLogo`, which turns an organisation or provider ID into its logo path for a theme. Also `phaseoMarkPath`, the SVG path of the Phaseo "P" mark. |
| `@phaseo/app-kit/provider-offers` | Provider display names and logo IDs for offers such as regional or fast routes. |
| `@phaseo/app-kit/gateway-status` | Gateway route statuses: normalising, ranking and choosing between them. |
| `@phaseo/app-kit/benchmarks/epoch` | Epoch AI benchmark helpers (the Capabilities Index and its confidence intervals). |
| `@phaseo/app-kit/format` | Display formatters: money, counts, speed, latency, token limits, durations, dates and times, relative times and the usage dashboard's figures. |

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
