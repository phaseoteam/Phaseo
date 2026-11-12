---
"@phaseo/gateway-api": patch
"@phaseo/sdk": patch
"@phaseo/web": patch
---

Realtime and Live session responses now return the Phaseo model id in `model` (for example `eleven-labs/scribe-v3-live`), as every other endpoint does. The provider's own model name moves to a new `provider_model` field.
