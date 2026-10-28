---
"@phaseo/gateway-api": patch
---

`phaseo/auto` and request classifiers now respect a request's limits on where its data may go:

- When the request sets `provider.require_zero_data_retention: true` (or `zdr: true`), required execution or data regions, or the workspace or the key's guardrail allows only providers with zero data retention, Auto shortlists only models with a route that meets them, instead of choosing a model that then fails at routing.
- Each candidate model is checked against those requirements before scoring, as the routing gate checks the chosen model.
- The classifier request that reads the prompt carries the same limits (zero data retention, regions, and the `only` and `ignore` providers). If the classifier model can't meet them, Auto classifies the request locally, so the prompt never goes to a provider the request ruled out. A request with routing limits the gateway can't honour (such as `data_collection: "deny"`) is refused before any classifier sees it.
- Request classifiers send their calls with the same limits as the request they label; a classifier whose model can't meet them leaves the request unlabelled.
- When the request's residency requirements are what leaves Auto no model (every model it considered failed them, or none in the shortlist could meet them), the request fails with `403 model_region_unavailable`, as it does for a fixed model; if models were also ruled out for other reasons, it still fails with `400 unsupported_model_or_endpoint`. `unmet_requirements` names the requirements no provider met; when providers meet each one but none meets them together, it lists them all.
- `model_region_unavailable` errors now include `reason`, `action` and `unmet_requirements` in the response, so callers can tell which requirement no provider met.
