---
"@phaseo/gateway-api": patch
---

The first request for a model an API key has not used yet no longer runs the full workspace lookup in the database when the key's workspace data is already cached. The gateway now reuses the cached key, credit and workspace settings, and loads only that model's routes and prices from the shared model catalogue. This applies to text requests (responses, chat completions and messages) from keys without spend caps, and the cached workspace data is replaced at least every five minutes and whenever the key or workspace changes.
