---
"@phaseo/sdk": major
---

`generateTranscription` and `generateTranslation` now send a multipart upload when the request has a `file`. Pass a `File` or `{ fileName, content, contentType? }`; the name is required because the gateway reads the audio format from its extension. A request without `file` (for example one with `file_url`) is still sent as JSON. A path string or unnamed bytes is rejected with a `TypeError` before anything is sent. `uploadFile` also accepts `{ fileName, content, contentType? }`, and the new `toUploadFile` helper is exported.
