---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/web": patch
---

Share one Broadcast destination registry across the gateway, the dashboard API and the dashboard, so every part agrees on which destinations exist and which endpoint an OTLP destination sends to. OTLP destinations configured with only `url` are now rejected at creation, because the exporter never read that field. A workspace can have up to 5 destinations of each type, enforced in the database; operators can raise this per workspace.
