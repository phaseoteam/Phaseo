---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
"@phaseo/cli": patch
---

Harden CLI OAuth sessions, key-pepper rotation, redirect handling, and abuse controls while moving the CLI to `api.phaseo.app`.

Add filtered, workspace-scoped, redacted request log listing and per-request inspection to the Phaseo CLI.
