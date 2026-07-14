---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Refresh Fireworks model discovery and catalog data to use the serverless-only models feed.

This updates scheduled discovery to read the serverless Fireworks models route, handle paginated responses, and ignore any non-serverless rows defensively. It also refreshes the Fireworks catalog and pricing data to match the current live serverless inventory.
