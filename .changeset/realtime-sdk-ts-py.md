---
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
---

Add a realtime voice client: `client.realtime.connect()` creates a session and opens the relay WebSocket, `sendAudio()` sends PCM16 audio, provider events pass through unchanged, and `end()` returns the `session.ended` final bill. Python needs `pip install "phaseo[realtime]"`.
