---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/web": patch
---

Department budgets now also hold back batch and video holds, realtime sessions and the request-context fallback, and the spend-limit coordinator counts a department's outstanding holds. Budgets count active holds across period rollover, captured video holds before their request row lands, and requests that were charged without succeeding. Workspace budgets count a batch hold once. A charge for a workspace with no wallet fails instead of being recorded as applied. I/O log retention stays at 90 days until extended retention is billed. Stale video holds whose job is gone, failed or already billed are released.
