---
"@phaseo/csharp-sdk": major
---

Upload files are passed explicitly. For transcriptions, translations and `UploadFile`, `file` can be a `PhaseoFile` (`FromBytes`, `FromPath`, `FromStream`), a `FileInfo`, or a `byte[]`/`Stream`. A `byte[]` or `Stream` takes its filename from the request's `filename` entry, or from the stream's own name for a `FileStream`. If there is no filename, the call throws `ArgumentException`, because the gateway reads the audio format from the file extension. A plain string is not accepted as a file and throws. Use `PhaseoFile.FromPath(...)` for a local file, or `file_url` for a remote file. A new `UploadFile(request, model, provider)` overload sends `model` and `provider` as query parameters to choose the batch provider.
