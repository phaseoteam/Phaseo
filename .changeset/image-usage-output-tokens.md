---
"@phaseo/gateway-api": patch
---

Report image output tokens as `output_tokens` in the `usage` of token-billed image responses (GPT Image, MiniMax H3-Image), which previously showed 0 while billing was correct.
