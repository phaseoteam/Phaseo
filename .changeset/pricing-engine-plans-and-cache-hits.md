---
"@phaseo/gateway-api": patch
---

Fix pricing for several catalogue card shapes. Fast-tier SKUs loaded through the request context are priced as the priority plan, as the fallback loader already did. Cards without standard rules use their own plan label (`default`, `early_access`) or `free`. Conditions written as `{ key, operator }` are read. Prices with digits below a nano are applied exactly. A cache write reported without a TTL split uses the TTL the request asked for. `input_tokens` tier conditions compare the full prompt length, cache writes included. On cards that price implicit and explicit cache hits separately, a reported hit is billed once, on the meter for the cache that served it. Alibaba thinking-mode answers use the thinking price.
