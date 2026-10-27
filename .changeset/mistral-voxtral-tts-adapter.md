---
"@phaseo/gateway-api": patch
---

Add a native Mistral text-to-speech adapter for Voxtral TTS. It maps `voice` to Mistral's `voice_id`, decodes the base64 audio Mistral returns into audio bytes, and bills input characters. Speed, instructions, streaming and aac/ogg output return a clear 400 instead of being silently ignored.
