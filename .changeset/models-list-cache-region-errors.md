---
"@phaseo/gateway-api": patch
---

Serve the model catalogue from cache (stale-while-revalidate across isolate memory, the Workers Cache and KV) instead of rebuilding it from about ten database queries on every request, and return `model_region_unavailable` (403) instead of a 502 provider failure when a regional gateway or residency requirement leaves no provider for a model.
