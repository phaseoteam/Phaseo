---
"@phaseo/gateway-api": patch
---

Add opt-in durable workspace cache publication with coalesced retry intents,
bounded background processing, and lease/revision fencing. Existing publication
behavior remains unchanged until the database migration and feature gates are enabled.
