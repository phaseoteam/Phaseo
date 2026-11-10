---
"@phaseo/gateway-api": patch
---

The gateway keeps API key lookups, workspace policies and per-key request settings cached for up to a day instead of 1–10 minutes. Any change to them still takes effect within about a minute. The first request after a quiet spell no longer looks the key and policy up again.
