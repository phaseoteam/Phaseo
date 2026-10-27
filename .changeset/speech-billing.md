---
"@phaseo/gateway-api": patch
---

Fix speech billing. Text-to-speech responses that providers stream back (OpenAI, Azure, Together, Morpheus, DeepInfra, MiniMax, StepFun, Novita, OVHcloud) are now priced, charged once and logged when the audio has been delivered, while the audio still streams straight to the client; only the content type and disposition headers are forwarded from the provider. Speech-to-text and translation bill from the usage the provider reports (`input_token_details.audio_tokens`, `text_tokens` and `output_tokens`, or `seconds` for whisper-1) and use the file-size estimate only when nothing is reported.
