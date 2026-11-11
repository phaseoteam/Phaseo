---
"@phaseo/java-sdk": patch
---

Send audio transcriptions, translations and batch file uploads as multipart/form-data. `createTranscription` and `createTranslation` accept a `file` (`byte[]`, `Path`, `File`, `InputStream`, or a String of content) and send multipart, with new `Path` overloads; a transcription with only `file_url`, `file_id` or `s3_presigned_url` still sends JSON. `uploadFile` now posts to `/batches/files`, sends `model` and `provider` in the query string, and gains `Path` overloads.
