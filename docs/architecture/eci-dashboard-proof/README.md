# ECI dashboard proof

Updated on 21 October 2026. Before images show production. After images show the AA-consistent workspace in a temporary local demo using saved public Epoch source files from 20 October. The demo rendered the actual dashboard component and was removed after verification. Desktop captures are 1920px; phone width is 390px. Public source values can change between captures.

| View | Before | After |
| --- | --- | --- |
| Desktop | [Before](before-desktop.png) | [After](after-desktop.png) |
| Phone | [Before](before-phone.png) | [After](after-phone.png) |
| Pinned domain comparison | — | [Comparison](domain-comparison.png) |

## Data contract

- General scores, release dates, accessibility and 90% confidence intervals come from [Epoch's published CSV](https://epoch.ai/data/eci_scores.csv). All source model identities are retained. A Phaseo model link requires an unambiguous existing catalogue match; source IDs take precedence over names. Catalogue fallback intervals are omitted because their confidence level is not established by this source contract.
- Domain point estimates use [published observations](https://epoch.ai/data/processed_data_for_eci.csv), [benchmark parameters](https://epoch.ai/data/edi_scores.csv) and [domain definitions](https://epoch.ai/data/benchmarks.json). The fit minimizes squared logistic prediction error, clips observations to 0.001–0.999 and uses bounds −100 to 300, as in Epoch's explorer. At least two distinct benchmarks are required per domain. No domain confidence intervals are invented or copied from general ECI.
- As in Epoch's explorer, the best observed result is used for each source model and benchmark. These are source model groupings, not claims about individual reasoning configurations. The methodology disclosure explains this distinction and the limits of domain progress comparisons.
- Nulls stay unavailable; zero and negative scores remain numeric. Missing release dates exclude a point from the timeline but not from the all-time rankings. The frontier is the strictly improving record within the active selection, taking the best score per release day. Ranks are relative to the filtered selection, with shared ranks for ties.
- Source downloads are cached with Next's hourly cache profile and a 12-second upstream timeout. The displayed sync date belongs to that cached retrieval. If domain downloads or parsing fail, general scores remain available. If general data fails, imported catalogue results are shown with an explicit fallback notice.

## Verification

- ECI and shared AA regression tests cover CSV identity/precision, missing/zero/negative values, logistic recovery, domain membership and observation aggregation, frontier ties, stable SVG focus, keyboard pinning, point differences, domain switching, empty selection and upstream fallback.
- Browser checks verified the shared right-hand picker, three chart sections, direct labels, pinned domain comparison, mobile model drawer with search and Done, and no document overflow at desktop and 390px.
- The production build passed. The first local development run loaded live Epoch scores and domains. The local production run initially demonstrated general-only fallback after an Epoch connection timeout; a later request failed earlier while fetching catalogue benchmark metadata. Final screenshots therefore use saved real public source files, not a claim of successful production data loading. No production writes, schema changes, imports or migrations were performed.

See the PR's Proof section for command results and build warnings.
