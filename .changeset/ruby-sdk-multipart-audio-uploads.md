---
"@phaseo/ruby-sdk": patch
---

Send audio transcriptions, translations and batch file uploads as multipart/form-data. `generate_transcription` and `generate_translation` accept a `file` (a `Pathname`, an IO, or a String of bytes) and send multipart; a transcription with only `file_url`, `file_id` or `s3_presigned_url` still sends JSON. `upload_file` now posts to `/batches/files` and sends `model` and `provider` in the query string.
