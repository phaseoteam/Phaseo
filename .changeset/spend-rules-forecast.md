---
"@phaseo/gateway-api": minor
---

Evaluate `forecast` spend rules, `previous_period` bases and rolling windows (behind `SPEND_RULES_ENABLED`).

- A forecast rule projects the period's spend to its end, the same straight line the usage dashboard draws (spend so far × period length ÷ time elapsed, in the rule's time zone), and alerts once per period when the projection reaches `threshold_amount_nanos` or one of `threshold_percents` of the base. It waits until 3 hours of a day, 24 hours of a week or 72 hours of a month have passed, and until at least a cent has been spent. The alert names the projected total and, when the pace reaches the limit before the period ends, the date it does.
- A `previous_period` base compares with the same point in the previous period on the local clock (today until 09:12 with yesterday until 09:12), the window before for a rolling rule, or the whole previous period for a forecast.
- `spend` and `budget_percent` rules can use a rolling window (`period: "rolling"`, `window_hours`). They alert while over a threshold at most once per `cooldown_minutes`, or sooner for a higher threshold. A rolling block rule's block has no reset time and lifts once spend over the window is below the block point.

The rule preview (`GET /v1/control/spend-rules/{id}/preview`) returns `evaluated: true` for these rules, a `forecast` object (projected total and percent, the period end it is for, the limit and when the pace reaches it, and when projections start), a `previous_period` object with the stretch the base covers, and `period.window_hours` for rolling rules.
