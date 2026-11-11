---
"@phaseo/csharp-sdk": patch
---

Send audio transcriptions, audio translations and file uploads as multipart/form-data. `CreateTranscription` and `CreateTranslation` have new overloads that take a `PhaseoFile`, and the dictionary overloads send multipart when the request has a `file`. Transcriptions that only pass `file_url`, `file_id` or `s3_presigned_url` are still sent as JSON. `UploadFile` now posts to `/batches/files`.
