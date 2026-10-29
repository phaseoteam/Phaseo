---
"@phaseo/gateway-api": patch
---

The gateway's spend-limit coordinator now knows about department budgets, so it can turn away a request once a department it counts toward has used its daily, weekly or monthly budget, with a 429 that names the department. This only takes effect when the coordinator runs in enforce mode, which is off everywhere for now: department budgets still only send alerts.
