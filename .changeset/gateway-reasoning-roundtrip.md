---
"@phaseo/gateway-api": patch
---

Round-trip model reasoning across tool-loop steps on `/v1/chat/completions` and `/v1/responses`: return Claude thinking signatures and redacted thinking, OpenAI, Azure and xAI encrypted reasoning, and Gemini thought signatures as provider-tagged `encrypted_content` and `reasoning_details`, request `reasoning.encrypted_content` when the gateway forces `store: false`, and replay each provider's state only to the provider family and model that issued it.
