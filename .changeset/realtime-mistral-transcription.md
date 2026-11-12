---
"@phaseo/gateway-api": minor
---

Realtime sessions support streaming transcription with Mistral Voxtral Realtime: 16 kHz audio is relayed to Mistral, the transcript streams back, and session.end waits for the final transcription.done before the bill (per minute of audio sent) settles.
