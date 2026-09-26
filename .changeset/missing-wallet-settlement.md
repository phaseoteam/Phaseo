---
"@phaseo/gateway-api": patch
---

Do not report a charge as settled when the debit reports a missing wallet, even if the legacy idempotency wrapper marks its record applied. Invalidate stale credit and retain unresolved recovery for reconciliation.
