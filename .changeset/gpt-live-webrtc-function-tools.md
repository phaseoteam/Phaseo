---
"@phaseo/gateway-api": minor
"@phaseo/sdk": minor
---

GPT Live function tools now work over WebRTC. `POST /v1/live/sessions` accepts `backend_settings.tools` with the WebRTC transport, and the new `POST /v1/live/sessions/{session_id}/function_call_output` takes each result from your server (`call_id`, `output`, and `create_response: false` on all but the last output when the backend makes several calls at once). Phaseo passes the output to the call on OpenAI's server-side connection with the same checks as the WebSocket relay: only for a call the backend made, once per call and up to 64 KB. The browser's data channel stays limited to closing and muting the call.
