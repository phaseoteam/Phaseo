---
"@phaseo/gateway-api": patch
---

GET /v1/models now lists every model. The catalogue loaded `v2_models` and its routes, capabilities, details, aliases and pricing rows in single unpaged reads, which PostgREST cuts off at 1,000 rows, so models past the first thousand (for example GLM 5.3) were missing from the list unless requested by id.
