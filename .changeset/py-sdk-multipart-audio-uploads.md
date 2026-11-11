---
"@phaseo/py-sdk": patch
---

Audio transcription and translation helpers now send multipart/form-data when you pass a `file` (bytes, a path or an open file), and transcription still sends JSON for `file_url`, `file_id` or `s3_presigned_url`. `upload_file` and `files.create` now accept `model` and `provider`, sent in the query string.
