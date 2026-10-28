---
"@phaseo/gateway-api": patch
---

`phaseo/auto` now respects a request's limits on where its data may go:

- When the request sets `provider.require_zero_data_retention` (or `zdr`), or the workspace or the key's guardrail allows only providers with zero data retention, Auto shortlists only models with a provider that offers it, instead of choosing a model that then fails at routing.
- Each candidate model is checked against the request's required execution and data regions and zero data retention before scoring, as the routing gate checks the chosen model.
- The classifier request that reads the prompt carries the same limits (zero data retention, regions, and the `only` and `ignore` providers). If the classifier model can't meet them, Auto classifies the request locally, so the prompt never goes to a provider the request ruled out.
- When no model Auto may choose meets the request's residency requirements, the request fails with `403 model_region_unavailable` and `unmet_requirements`, as it does for a fixed model.
- `model_region_unavailable` errors now include `reason`, `action` and `unmet_requirements` in the response, so callers can tell which requirement no provider met.
