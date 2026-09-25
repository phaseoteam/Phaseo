---
"@phaseo/gateway-api": patch
---

Reuse bounded shared provider and pricing discovery snapshots after authentication and scope checks. Warm reads avoid repeated database queries and cache writes while private model discovery and authoritative inference pricing remain unchanged.
