---
"@phaseo/gateway-api": minor
---

Evaluate `balance` spend rules (behind `SPEND_RULES_ENABLED`). A balance rule alerts when the available balance (balance minus reserved credit, what requests are admitted against) is at or below `threshold_amount_nanos`, or when the runway (available balance ÷ spend per day over the last `window_hours`) is at or below `runway_days`. It alerts once per drop, waits out `cooldown_minutes` between alerts, re-arms once the balance is back above the threshold, and records a drop without alerting while Auto Top-Up is on and working. Workspaces with balance rules are checked every 15 minutes, with or without new usage. The rule preview (`GET /v1/control/spend-rules/{id}/preview`) now returns `evaluated: true` and a `balance` object (balance, reserved, available, burn per day, runway, armed) for balance rules.

The low-balance email moves off the request path: a scheduled sweep sends it within five minutes of the balance falling to the workspace's threshold, instead of a check after every charged request. Same threshold, recipient and message. It is now sent once per drop (at most every six hours, as before) rather than every six hours while the balance stays low, and not while Auto Top-Up is refilling the balance, matching the low-balance push.
