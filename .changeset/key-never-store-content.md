---
"@phaseo/gateway-api": patch
---

Keys can now be created to never have their content stored. For a key with `never_store_content`, the gateway keeps no I/O log, caches no responses, leaves prompts, outputs and raw upstream error bodies out of its own telemetry, and forwards no content to observability destinations, whatever the workspace settings. The setting cannot be turned off once it is on.
