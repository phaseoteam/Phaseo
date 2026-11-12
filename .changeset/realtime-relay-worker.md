---
"@phaseo/gateway-api": patch
---

Realtime voice has a maintenance switch. While it's on, new realtime and GPT Live sessions are refused with `503 realtime_maintenance` and a `Retry-After` header, and calls already in progress carry on. A relay connection for an unknown or expired session now gets a 401, 409 or 410 instead of a server error.
