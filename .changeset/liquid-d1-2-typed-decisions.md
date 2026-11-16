---
"@phaseo/gateway-api": minor
"@phaseo/sdk": patch
"@phaseo/py-sdk": patch
---

Decisions requests in the state and named-question format can now send audio clips (`audio`, base64 data URLs) and ask the typed questions Liquid d1.2 answers: `text`, `number` (with `unit`, or `range` and `step` for an estimate), `date`, `spans`, `boxes` (with `max`), and `choice` with `multiple: true`. Typed questions go only to routes that list them. Liquid decision routes now receive the images and audio in a request; images were previously dropped.
