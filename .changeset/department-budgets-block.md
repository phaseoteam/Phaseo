---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
"@phaseo/docs": patch
"@phaseo/sdk": patch
---

Department budgets now refuse API-key requests once they are used up. When a department has used its daily, weekly or monthly budget, API-key requests that count toward it return `429` `key_limit_exceeded` with reason `department_<interval>_cost_budget_reached`, the department's `department_id` and `department_name`, and `reset_at` and `Retry-After` for when the budget resets. Batch jobs, realtime sessions and OAuth requests are not blocked. Owners and admins still get a mobile push at about 80% and 100%; those alerts come from usage that can lag by up to an hour, so requests can be refused before the 100% alert arrives. Settings → Budgets, the API reference and the Terraform provider docs now describe this.
