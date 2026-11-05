---
"@phaseo/gateway-api": patch
---

Trusted workloads refuse a custom-issuer token with more than 100 distinct top-level claim values with `workload_token_too_many_claims`, before any policy lookup.
