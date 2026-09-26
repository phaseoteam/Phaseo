---
"@phaseo/gateway-api": patch
---

Keep ambiguous debit confirmations unresolved and invalidate stale admission credit. Validate settlement replies before side effects, preserving idempotent replay without adding successful-request database operations.
