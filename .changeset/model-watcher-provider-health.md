---
"@phaseo/gateway-api": patch
---

Record each provider's model watcher check outcome in `model_discovery_provider_status` and alert the private discovery channel when a provider has failed for over an hour, when it recovers, and when a checked provider stops being checked.
