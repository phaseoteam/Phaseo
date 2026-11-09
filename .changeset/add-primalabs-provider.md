---
"@phaseo/gateway-api": patch
---

Add PrimaLabs as an OpenAI-compatible provider (`primalabs`, key `PRIMALABS_API_KEY`). For Kimi models, sampling values PrimaLabs rejects (temperature other than 0, 0.6 or 1, top_p other than 0.95, non-zero penalties) are dropped so the request succeeds with the provider defaults.
