---
"@phaseo/cli": patch
---

Fix model catalog sync for OpenCode, fx, DeepSeek Harness, Pi, Prime Agent and OpenClaw. The CLI filtered the catalog by `chat.completions`, which no current model advertises, so setup fell back to the default model only. It now filters by the gateway's `text.generate` capability and still accepts the older endpoint names.
