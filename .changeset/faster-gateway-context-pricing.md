---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
---

Reduce cold gateway overhead by joining pricing reads, coalescing provider limit configuration loads, and persisting authentication caches in the background. Reuse BYOK master-key imports within each request and include private-model lookups and BYOK hydration in context timings.

Skip repeated private-model lookups using a bounded five-second metadata index. Retain fresh credential and routing reads for matching private models, and invalidate gateway key caches after account private-model mutations.
