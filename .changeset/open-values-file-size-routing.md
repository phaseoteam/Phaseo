---
"@phaseo/gateway-api": minor
"@phaseo/web": patch
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
---

Parameter specs can mark a value list `open`: the values are common choices and any other value is accepted, as for ElevenLabs voices, where any voice in your library works. Routing never rejects a value outside an open list. Uploads such as transcription files go only to providers whose `max_file_size_bytes` accepts the file. The playground shows voice names and, for open voice lists, takes any voice ID.
