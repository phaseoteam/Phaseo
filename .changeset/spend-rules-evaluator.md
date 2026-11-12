---
"@phaseo/gateway-api": minor
---

Evaluate spend rules and send spend alerts (notify only, off until `SPEND_RULES_ENABLED` is turned on). Every 5 minutes the gateway's scheduled job evaluates `spend` and `budget_percent` rules (amount, workspace budget or key limit base) for workspaces whose spend changed, whose rule period rolled over, or, once an hour, all others. Rules cover the workspace, a key, a member, a department, a model or a provider, over a calendar day, Monday week or month in the rule's time zone (or the workspace's billing time zone). Each threshold fires once per period; crossing several at once sends one `spend_alert` naming the highest. Alerts go to the rule's own destinations when it has any, otherwise to the workspace's `spend_alert` routes, and to the mobile app as a money push for owners, admins and the person the rule is about.
