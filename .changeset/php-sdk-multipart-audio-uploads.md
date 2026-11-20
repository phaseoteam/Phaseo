---
"@phaseo/php-sdk": patch
---

Send audio transcriptions, audio translations and file uploads as multipart/form-data. `generateTranscription`, `generateTranslation` and `uploadFile` send multipart when the request has a `file`. Transcriptions that only pass `file_url`, `file_id` or `s3_presigned_url` are still sent as JSON. `uploadFile` now posts to `/batches/files` and accepts optional `model` and `provider` arguments, which are sent as query parameters.
