---
"@phaseo/gateway-api": patch
---

Forward private model watcher alerts to an optional T3 Code webhook (`MODEL_DISCOVERY_T3_WEBHOOK_URL`, or the `GATEWAY_CACHE` KV key `model-discovery/t3-webhook-url/v1`) after Discord or Slack delivery, so an agent thread can check and act on each change.
