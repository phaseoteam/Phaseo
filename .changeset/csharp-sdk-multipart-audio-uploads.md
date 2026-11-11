---
"@phaseo/csharp-sdk": patch
---

Send audio transcriptions, audio translations and file uploads as multipart/form-data. `CreateTranscription` and `CreateTranslation` accept a `PhaseoFile` (from bytes, a path or a stream), and the existing dictionary overloads switch to multipart when `file` is a `PhaseoFile`, `byte[]`, `Stream`, `FileInfo`, data URL or local path. Transcriptions that only pass `file_url`, `file_id` or `s3_presigned_url` are still sent as JSON. `UploadFile` now posts to `/batches/files` and accepts optional `model` and `provider` arguments, which are sent as query parameters.
