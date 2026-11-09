---
"@phaseo/gateway-api": patch
---

Debounce model removals in the provider model watcher. A model now has to stay missing from a provider's /models list for six hours (`MODEL_DISCOVERY_REMOVAL_CONFIRM_MINUTES`, default 360) before its removal is announced and its row deleted, instead of two consecutive sweeps. Providers whose list is served from inconsistent CDN caches no longer produce repeated "removed" and "added" alerts for the same model. Newly listed models are still announced immediately.
