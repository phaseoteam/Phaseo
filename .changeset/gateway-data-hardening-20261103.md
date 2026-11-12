---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/docs": patch
---

Harden gateway data handling. Executor stack traces no longer reach error bodies, webhooks or stored attempts. Provider error bodies are not stored for never-store or zero-data-retention requests, and customer OTLP exports leave zero-data-retention content out. BYOK credentials created through the control API record their encryption binding, and signed-in clients can no longer read BYOK ciphertext or write its encryption columns. Public model and ranking endpoints reject free-text colo, date, time range, bucket and metric values before querying. File and video downloads pass only safe headers and types. The free-model daily allowance now applies per user across workspaces.
