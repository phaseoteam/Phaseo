---
"@phaseo/java-sdk": patch
---

Add `PhaseoFile` for upload files with a required filename and optional content type (`fromBytes`, `fromStream`, `fromPath`). `Path` and `File` values use their own name, and `byte[]` or `InputStream` values need a `filename` entry. A `String` file and a file without a filename throw `IllegalArgumentException`, because the gateway reads the audio format from the extension.
