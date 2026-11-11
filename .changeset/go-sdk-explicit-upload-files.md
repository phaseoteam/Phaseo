---
"@phaseo/go-sdk": patch
---

Upload files must now have a `Filename`, because the gateway reads the audio format from its extension. Before, a nameless file was sent as `upload` and translation rejected it. A transcription or translation whose `"file"` is not a `phaseo.File` (for example a path string) now returns an error instead of being sent as JSON. The content type comes from the extension when you don't set one.
