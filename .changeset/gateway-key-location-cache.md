---
"@phaseo/gateway-api": patch
---

API key checks after a quiet spell are faster: the gateway now keeps its cached copy of each key in the local data centre instead of re-reading it from central storage after a minute. Revoked and changed keys still stop working within about a minute.
