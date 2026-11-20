---
"@phaseo/java-sdk": patch
---

Send audio transcriptions, translations and batch file uploads as multipart/form-data. `createTranscription` and `createTranslation` send multipart when the request has a `file`, with new `Path` overloads; a transcription with only `file_url`, `file_id` or `s3_presigned_url` still sends JSON. `uploadFile` now posts to `/batches/files`, sends `model` and `provider` in the query string, and gains `Path` overloads.
