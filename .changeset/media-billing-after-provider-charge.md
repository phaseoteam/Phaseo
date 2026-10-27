---
"@phaseo/gateway-api": patch
---

Bill synchronous media requests correctly once the provider has charged for them.

- Image, image edit, speech, transcription, translation, music, OCR and parse requests are no longer sent to a second provider after the first has answered successfully. Before, a pricing or mapping error at that point could produce a second paid generation.
- Pricing no longer fails after the provider has charged. When a request matches none of a meter's price conditions, the meter is billed at its base rate and the fallback is logged.
- Gemini 3 Pro Image is priced at the image size it was generated at, on both the Images API and chat: Google's 1K default, `quality`, or `image_config.image_size`.
- Grok Imagine image generations and edits without a `resolution` are billed at xAI's 1k default instead of $0.
- Together Whisper transcriptions and translations are billed per audio minute. Translations now read the `duration` in verbose_json responses.
- Groq Whisper applies Groq's 10-second minimum charge.
- Cohere rerank is billed per search unit (`meta.billed_units.search_units`) instead of per request.
- ElevenLabs music without `music_length_ms` is billed by the length of the returned audio.
- Streamed images on per-image price cards are billed per completed image.
- Realtime sessions bill image input on OpenAI, and image and video input on Gemini Live.
- A successful media request priced at $0 against a paid price card now raises an operational alert.
