# ECI dashboard proof

Updated on 22 October 2026. Before images show production. The desktop, phone and range-comparison images show the local production build loading live public Epoch data on 22 October. Desktop captures are 1920px; phone width is 390px. The older domain-comparison image was captured on 21 October using saved public source files. Public source values can change between captures.

| View | Before | After |
| --- | --- | --- |
| Desktop | [Before](before-desktop.png) | [After](after-desktop.png) |
| Phone | [Before](before-phone.png) | [After](after-phone.png) |
| Pinned range comparison | — | [Comparison](range-comparison.png) |
| Pinned domain comparison | — | [Comparison](domain-comparison.png) |
| Search for ECI | — | [Branded search entry](search-eci.png) |

## Data contract

- General scores, release dates, accessibility and 90% confidence intervals come from [Epoch's published CSV](https://epoch.ai/data/eci_scores.csv). All source model identities are retained. A Phaseo model link requires an unambiguous existing catalogue match; source IDs take precedence over names. Catalogue fallback intervals are omitted because their confidence level is not established by this source contract.
- Domain point estimates use [published observations](https://epoch.ai/data/processed_data_for_eci.csv), [benchmark parameters](https://epoch.ai/data/edi_scores.csv) and [domain definitions](https://epoch.ai/data/benchmarks.json). The fit minimizes squared logistic prediction error, clips observations to 0.001–0.999 and uses bounds −100 to 300, as in Epoch's explorer. At least two distinct benchmarks are required per domain. No domain confidence intervals are invented or copied from general ECI.
- As in Epoch's explorer, the best observed result is used for each source model and benchmark. These are source model groupings, not claims about individual reasoning configurations. The methodology disclosure explains this distinction and the limits of domain progress comparisons.
- Nulls stay unavailable; zero and negative scores remain numeric. Missing release dates exclude a point from the timeline but not from the all-time rankings. The frontier is the strictly improving record within the active selection, taking the best score per release day. Ranks are relative to the filtered selection, with shared ranks for ties.
- Source downloads are cached with Next's hourly cache profile and a 12-second upstream timeout. The displayed sync date belongs to that cached retrieval. If domain downloads or parsing fail, general scores remain available. If general data fails, imported catalogue results are shown with an explicit fallback notice.

## Verification

- ECI and shared AA regression tests cover CSV identity/precision, missing/zero/negative values, logistic recovery, domain membership and observation aggregation, frontier ties, stable SVG focus, keyboard pinning, point differences, domain switching, empty selection and upstream fallback.
- The default view compares estimates and published 90% intervals on a shared score axis. Missing intervals remain unavailable. The general timeline keeps its uncertainty bars visible. Coding and maths remain point estimates, and comparison cards do not infer statistical significance from overlapping marginal intervals.
- Thirteen ECI tests passed, including default range rendering, missing intervals, zero/negative estimates, timeline focus/pinning, interval comparison, source parsing and fallback. Full web typechecking, localization validation and the production build passed. The UI audit found 0 unreviewed candidates across 1610 modules.
- Browser checks loaded live data with 10 selected models and 10 published ranges, verified pinned comparison with both intervals, timeline uncertainty, mobile model drawer with search and Done, and no document overflow at desktop and 390px. The comparison card stayed inside the phone viewport. CSV export produced 10 rows with a confidence-interval field containing numeric low/high bounds.
- Earlier local requests on 21 October had upstream timeouts; the 22 October production-build verification succeeded with live scores and domain data. This is local verification, not a claim of production deployment. No production writes, schema changes, imports or migrations were performed.
- Search follow-up: 13 search/alias/ranking tests passed, full web typechecking passed, and scoped ESLint had 0 errors (4 existing warnings in virtualizer and flag-image code). Browser verification found one branded benchmark for both ECI and Epoch; exact ECI aliases rank ahead of incidental substring matches. Both search renderers use the Epoch mark.

See the PR's Proof section for command results and build warnings.
