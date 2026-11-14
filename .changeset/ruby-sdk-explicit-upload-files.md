---
"@phaseo/ruby-sdk": major
---

Upload files must now name themselves. Pass a `Pathname`, an IO (a `File` uses its own name, other IOs need a `filename` key), or `{ file_name:, content:, content_type: }` for bytes in memory. A plain String is rejected because it could be bytes or a path, and a file without a filename raises `ArgumentError`, because the gateway reads the audio format from the extension.
