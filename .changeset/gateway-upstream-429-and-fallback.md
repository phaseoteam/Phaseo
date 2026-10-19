---
"@phaseo/gateway-api": patch
---

Return `429` with `Retry-After` when every provider tried for a request rate limited it, instead of `502`; BYOK responses keep their `X-Phaseo-Upstream-RateLimit-*` headers. A request every provider rejected as invalid (`400`, `413`, `422`) no longer falls back to the next model in `models` or a dynamic route. After a model fallback, the response `model` is the Phaseo ID of the model that served it.
