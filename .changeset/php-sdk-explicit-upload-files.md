---
"@phaseo/php-sdk": major
---

Upload files are passed explicitly. For transcriptions, translations and `uploadFile`, `file` can be a `PhaseoFile` (`fromBytes`, `fromPath`, `fromStream`), an array `['file_name' => ..., 'content' => string|resource, 'content_type' => ?string]`, an `SplFileInfo`, or a stream resource, `CURLFile` or `CURLStringFile`. A stream, `CURLFile` or `CURLStringFile` takes its filename from the payload's `filename` entry, or else from its own name. If there is no filename, the call throws `InvalidArgumentException`, because the gateway reads the audio format from the file extension. A plain string is not accepted as a file and throws. Use `PhaseoFile::fromPath(...)` for a local file, or `file_url` for a remote file.
