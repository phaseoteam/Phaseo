---
"@phaseo/gateway-api": patch
---

Accept `config` as a JSON field in multipart requests to `/v1/audio/transcriptions`, so provider options such as `config.elevenlabs` work with an uploaded file. ElevenLabs Scribe v3 `secondary_language_codes` is now sent to ElevenLabs as one form field per language code.
