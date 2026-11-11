---
"@phaseo/gateway-api": patch
---

Record each request attempt's wallet charge key on its request row, so every charge joins directly to the attempt it paid for, including model fallback attempts. Generation lookups do not return the new field.
