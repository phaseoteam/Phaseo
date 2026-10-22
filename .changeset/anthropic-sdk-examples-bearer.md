---
"@phaseo/web": patch
"@phaseo/docs": patch
---

Anthropic SDK examples on model pages, the playground, the migration guide, the landing page and the Anthropic SDK and migration docs now pass the Phaseo key as `authToken` (`auth_token` in Python), which sends `Authorization: Bearer` on every SDK version, and use the root host `https://api.phaseo.app` so the SDK calls `/v1/messages` instead of `/v1/v1/messages`.
