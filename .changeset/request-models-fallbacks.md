---
"@phaseo/gateway-api": minor
"@phaseo/docs": patch
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/cpp-sdk": minor
"@phaseo/rust-sdk": minor
---

Honour the request-level `models` fallback list on every inference endpoint. `model` is tried first, then up to eight `models` entries in order when an attempt fails with `429`, `500`, `502`, `503`, or `504`. Each fallback reruns the full pipeline, and logs, usage, billing and the response `model` reflect the model that served the request. Streams fall back only before the first byte, and video and music jobs only at submission. Realtime sessions, batches and council runs reject `models` with a `400` instead of ignoring it.
