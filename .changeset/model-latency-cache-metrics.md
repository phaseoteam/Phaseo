---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Record time to first token for non-streaming text requests, which the gateway already streams from the provider, so model latency charts include them. Model performance cards stay on percentile bands instead of switching to provider series when a metric has no percentile values.
