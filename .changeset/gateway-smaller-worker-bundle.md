---
"@phaseo/gateway-api": patch
---

The gateway Worker script is about a quarter smaller, so it loads faster on a cold start. Requests and responses are unchanged.

- zod is imported as a namespace, so the bundle no longer carries its ~40 error-message locales or JSON Schema conversion.
- The Supabase service client is built from the query and auth libraries only, without supabase-js's storage, realtime and functions clients. It sends the same requests.
- Automatic top-ups and payment-method expiry checks call Stripe's REST API directly instead of through the Stripe SDK, with the same API version, idempotency keys, retries and timeout.
- ElevenLabs Music and StepFun transcription read audio duration from MP3, Ogg and WAV headers directly instead of through music-metadata.
