---
"@phaseo/gateway-api": patch
---

Record actual async wallet charges atomically in the credit ledger, with reservation-based idempotency and accurate captured/released hold counters. Ledger write failures roll back settlement. Holds, releases and zero-cost results do not create charge entries.
