---
"@phaseo/gateway-api": patch
---

Realtime voice calls now run in their own Worker, `phaseo-realtime`, so routine gateway deploys no longer end calls in progress. Connections still go through `api.phaseo.app`.
