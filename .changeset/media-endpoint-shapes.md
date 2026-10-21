---
"@phaseo/gateway-api": patch
"@phaseo/sdk": patch
"@phaseo/py-sdk": patch
"@phaseo/go-sdk": patch
"@phaseo/csharp-sdk": patch
"@phaseo/php-sdk": patch
"@phaseo/ruby-sdk": patch
"@phaseo/java-sdk": patch
"@phaseo/cpp-sdk": patch
"@phaseo/rust-sdk": patch
---

Fix request and response shapes on the media endpoints:

- Sora video requests without `seconds` or `size` now use OpenAI's defaults (4 seconds, 720x1280) and are billed for them, instead of being refused.
- Voyage multimodal embeddings send base64 images and videos as data URLs, as Voyage documents.
- Transcriptions and translations requested with `response_format` `text`, `srt` or `vtt` return the plain transcript or subtitle body instead of JSON.
- Fireworks FLUX image generation calls Fireworks' text_to_image workflow and returns the image as `b64_json`.
- Chat Completions returns OpenAI audio output as `message.audio` (`id`, `data`, `expires_at`, `transcript`), keeps `delta.audio` pieces in streams, and bills audio tokens at the audio input and output rates instead of also as text.
