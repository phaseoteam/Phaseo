---
"@phaseo/gateway-api": minor
---

Keep serving retired models while a provider route is enabled. When a retired model has no provider left, return `410 model_retired` with the retirement date and the suggested `replacement_model`.
