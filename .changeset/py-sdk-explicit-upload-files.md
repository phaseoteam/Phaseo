---
"@phaseo/py-sdk": patch
---

Make Python SDK file uploads explicit. Audio transcription and translation, `upload_file` and `files.create` now take a `{"file_name", "content", "content_type"}` dict, bytes or a binary file object, or a `pathlib.Path`. A plain string raises `TypeError`. Bytes with no `filename` (and no file name of their own) raise `ValueError` instead of being sent as `upload`. The content type defaults to a guess from the filename extension.
