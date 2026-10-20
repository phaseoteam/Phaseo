# ECI dashboard proof

Captured on 20 October 2026. Before images show production; after images show the local implementation with real public Epoch data. The comparison image is from a local production build. Desktop widths are 1280–1440px; phone width is 390px. Public source values can change between captures.

| View | Before | After |
| --- | --- | --- |
| Desktop | [Before](before-desktop.png) | [After](after-desktop.png) |
| Phone | [Before](before-phone.png) | [After](after-phone.png) |
| Pinned domain comparison | — | [Comparison](domain-comparison.png) |

## Data contract

- General scores, release dates, accessibility and confidence intervals come from [Epoch's published CSV](https://epoch.ai/data/eci_scores.csv). All source model identities are retained. A Phaseo model link requires an unambiguous existing catalogue match; source IDs take precedence over names.
- Domain point estimates use [published observations](https://epoch.ai/data/processed_data_for_eci.csv), [benchmark parameters](https://epoch.ai/data/edi_scores.csv) and [domain definitions](https://epoch.ai/data/benchmarks.json). The fit minimizes squared logistic prediction error, clips observations to 0.001–0.999 and uses bounds −100 to 300, as in Epoch's explorer. At least two distinct benchmarks are required per domain. No domain confidence intervals are invented or copied from general ECI.
- As in Epoch's explorer, the best observed result is used for each source model and benchmark. These are source model groupings, not claims about individual reasoning configurations. The methodology disclosure explains this distinction and the limits of domain progress comparisons.
- Nulls stay unavailable; zero and negative scores remain numeric. Missing release dates exclude a point from the timeline but not from the all-time rankings. The frontier is the strictly improving record within the active selection, taking the best score per release day. Ranks are relative to the filtered selection, with shared ranks for ties.
- Source downloads are cached with Next's hourly cache profile and a 12-second upstream timeout. The displayed sync date belongs to that cached retrieval. If domain downloads or parsing fail, general scores remain available. If general data fails, imported catalogue results are shown with an explicit fallback notice.

## Verification

- Eleven deterministic Jest tests cover CSV identity/precision, missing/zero/negative values, logistic recovery, domain membership and observation aggregation, frontier ties, stable SVG focus, keyboard pinning, point differences, domain switching, empty selection and upstream fallback.
- Browser checks verified timeline and domain rendering, pinned comparison, mobile model drawer, and no document overflow at 1440px and 390px.
- Local production build rendered actual Epoch scores. No production writes, schema changes, imports or migrations were performed.

See the PR's Proof section for command results and build warnings.
