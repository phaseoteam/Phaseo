---
"@phaseo/cpp-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/gateway-api": minor
"@phaseo/go-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/rust-sdk": minor
"@phaseo/sdk": minor
---

Evaluate `spike` spend rules (behind `SPEND_RULES_ENABLED`).

- A spike rule compares spend in its scope over the last `window_hours` with the median of the same window over the previous 7 days: the same hours on each of the 7 days before for windows under 24 hours, or the non-overlapping windows before it that fit in 7 days for longer ones. It alerts when spend is at least `spike_multiplier` times that median (default 3) and at least `spike_floor` (default $5), at most once per `cooldown_minutes` (default 360). For example: "Spend in the last 3 hours is $42.10, 4.2× your usual $10.02 for this time of day."
- When the median is 0, only the floor applies, and the alert says so. Spike rules wait until the workspace has spent in at least 3 of the baseline windows, so a new workspace does not alert on its first day.
- Windows are counted in hours, so a rule's time zone does not change the result.
- `window_hours` for spike rules is now at most 56, so that 3 windows fit in the previous 7 days. Spike rules cannot block.

The rule preview (`GET /v1/control/spend-rules/{id}/preview`) returns `evaluated: true` for spike rules, the window as `period`, spend over it as `value`, the median as `base`, the point the rule fires at as `next_threshold`, and a `spike` object (current spend, baseline, multiple, multiplier, floor, how many baseline windows there are and how many had spend, whether it is spiking, and when the cooldown ends).
