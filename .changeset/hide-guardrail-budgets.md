---
"@phaseo/web": patch
"@phaseo/docs": patch
---

The guardrail editor no longer shows the Budget Policies section. Guardrail request and spend limits were saved but never enforced, so they are hidden until per-key, member and department rate limits replace them. Saving a guardrail keeps any values it already has. The guardrail API reference and cookbook now say that the `budgets` field has no effect and point to API key limits and workspace budgets instead.
