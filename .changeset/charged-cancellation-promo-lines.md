---
"@phaseo/gateway-api": patch
---

Record the pricing lines of failed requests that were still charged (a stream the client left, or a checkpoint charge kept after a finalization error), so per-SKU totals such as promotion budgets count them. ElevenLabs transcriptions with more than 100 keyterms are now billed for at least 20 seconds of audio, as ElevenLabs bills them.
