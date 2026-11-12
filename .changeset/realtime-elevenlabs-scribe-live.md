---
"@phaseo/gateway-api": minor
---

Realtime sessions support streaming transcription with ElevenLabs Scribe v3 Live (`eleven-labs/scribe-v3-live`): the relay opens ElevenLabs' socket at the first audio chunk with the settings from `session.update`, translates its transcripts to the `transcription.*` events used for Mistral, and on `session.end` commits the rest and waits for the final transcript before the bill (per minute of audio sent) settles. Keyterms, transcript editing and entity detection are rejected until they can be billed.
