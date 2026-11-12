---
"@phaseo/gateway-api": patch
---

The gateway no longer writes a second copy of each provider attempt to the old upstream-requests table. Request detail already reads attempts from the new attempt records for requests made since 9 November 2026; older requests still show their attempts from the old table, which is kept read-only.
