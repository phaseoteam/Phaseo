---
"@phaseo/go-sdk": patch
---

`CreateTranscription` and `CreateTranslation` now send audio as a multipart upload when the request map holds a `phaseo.File` under `"file"` (read one from disk with `phaseo.FileFromPath`). Before, they always sent JSON, so translation always failed. A transcription that only sets `file_url` is still sent as JSON. New `UploadFile` uploads a batch input file to `/batches/files`, with optional `Model` and `Provider` to choose the batch provider.
