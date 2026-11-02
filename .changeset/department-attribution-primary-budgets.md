---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
"@phaseo/sdk": patch
---

The workspace's department attribution setting (`spend.department_attribution`) now applies to department budgets and department rate limits as well as spend rules. With `primary`, a member's keys without their own department, and their OAuth requests, count toward their primary department only.
