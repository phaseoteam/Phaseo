---
"@phaseo/gateway-api": patch
---

Phala routes can now be served through RedPill, Phala's gateway. The gateway deploy passes the optional `PHALA_API_KEY` and `PHALA_BASE_URL` secrets, model discovery lists RedPill's full Phala catalogue instead of only Phala-hosted models, and Phala serves System One decision models such as Kev 4B through `POST /v1/systemone`.
