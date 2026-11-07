---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/web": patch
---

Department budgets now also hold back batch and video holds, realtime sessions and the request-context fallback, and the spend-limit coordinator counts a department's outstanding holds. Budgets count active holds across period rollover, captured video holds before their request row lands, requests that were charged without succeeding, stream charges taken in steps, and delivered requests whose charge is awaiting reconciliation, each exactly once, also after the key is deleted. Workspace budgets count a batch hold once. A charge for a workspace with no wallet fails instead of being recorded as applied. I/O log retention stays at 90 days until extended retention is billed, and the API reference now says `retention_days` accepts only 90. Stale video holds whose job is gone, failed or already billed are released. Department status and its 80% and 100% alerts now count what admission enforces, and the 100% alert, settings help, API reference and Terraform docs no longer say batch jobs, realtime sessions or OAuth requests are exempt: department budgets refuse them all. Charges recorded without a key count toward the key and department of their request or batch.
