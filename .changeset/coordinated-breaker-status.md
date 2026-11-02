---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
---

Provider routing status on model pages reflects the shared circuit breakers again: breaker changes are recorded as they happen, a breaker past its cooldown shows as recovering rather than limited, and a status that cannot be read is no longer cached as "no issues".
