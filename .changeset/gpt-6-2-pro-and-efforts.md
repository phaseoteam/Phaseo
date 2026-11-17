---
"@phaseo/gateway-api": patch
---

Add GPT-6.2 Sol Pro and GPT-6.2 Astra Pro, which call the base model with Pro reasoning mode for both live and batch requests. Batch now also recognises GPT-6 Sol Pro and GPT-6 Luna Pro. GPT-6.2 Sol and Astra now accept `xhigh` and `max` reasoning effort, instead of having them lowered to `medium` and `high`. Pro models now keep Pro reasoning mode even when a route's parameter allowlist leaves out `reasoning.mode`.
