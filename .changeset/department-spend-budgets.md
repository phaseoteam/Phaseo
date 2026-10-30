---
"@phaseo/gateway-api": minor
"@phaseo/docs": patch
"@phaseo/sdk": patch
---

Add department spend budgets (beta) at `/v1/department-budgets`. A daily, weekly or monthly budget counts the same keys and OAuth requests as department rate limits, and owners and admins get a mobile push at about 80% and again at 100%. Department budgets send alerts only and never reject requests.
