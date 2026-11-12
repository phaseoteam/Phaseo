---
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
---

Add a realtime voice client: `client.realtime.connect()` creates a session and opens the relay WebSocket, `sendAudio()` sends PCM16 audio, provider events pass through unchanged, and `end()` returns the `session.ended` final bill. In browsers, `connectRealtimeSession(info)` joins a session your server created with `client.realtime.createSession()`, so the API key stays on the server. Python needs `pip install "phaseo[realtime]"`.
