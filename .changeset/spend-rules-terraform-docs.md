---
"@phaseo/gateway-api": minor
---

Remove the deprecated guardrail budget fields, and document spend alerts.

- Guardrails no longer have the `budgets` input or the `daily_limit_requests`, `weekly_limit_requests`, `monthly_limit_requests`, `daily_limit_cost_nanos`, `weekly_limit_cost_nanos` and `monthly_limit_cost_nanos` fields. They were never enforced, have been hidden in the dashboard and were marked deprecated in the API. Guardrail responses no longer include them, and the columns are dropped from the database.
- For compatibility, `POST /v1/guardrails` and `PATCH /v1/guardrails/{id}` still accept a request that sends any of them: the fields are ignored, not rejected. Use API key limits, workspace budgets or spend rules instead.
- The generated SDKs drop the `GuardrailBudgetInput` type and the six fields from the guardrail types.
- New guide, Spend alerts, covering every alert type, scope, period and base, grace-margin blocking (the `spend_rule_blocked` 429 and the `x-phaseo-spend-warning` header), balance, forecast, spike, spend reports, routing, the API and Terraform; plus API reference pages for the spend rules and spend blocks endpoints, in all 9 languages.
- The Terraform provider adds the `phaseo_spend_rule` and `phaseo_workspace_budget` resources and the `phaseo_spend_rules`, `phaseo_spend_blocks` and `phaseo_workspace_budgets` data sources.
