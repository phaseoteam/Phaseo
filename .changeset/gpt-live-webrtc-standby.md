---
"@phaseo/gateway-api": minor
"@phaseo/sdk": minor
"@phaseo/web": patch
"@phaseo/web-api": patch
---

GPT Live sessions can run over WebRTC, behind the `live_webrtc` feature gate. `POST /v1/live/sessions` accepts `transport: { type: "webrtc", sdp }` with the browser's SDP offer and returns OpenAI's SDP answer in `transport.sdp`; the audio then goes directly from the browser to OpenAI while Phaseo follows and bills the call from OpenAI's server-side connection. WebRTC sessions can use standby with `wake_policy: { type: "speech" }` and `idle_timeout_s` (5 to 60), so idle time is billed at $0.02 per minute instead of $0.05. The new `GET /v1/live/sessions/{session_id}` returns a Live session's status, standby state, warnings and final `session.ended`, and `POST /v1/live/sessions/{session_id}/close` ends a WebRTC call. Function tools aren't supported over WebRTC yet; the WebSocket transport stays the default and is unchanged. The TypeScript SDK adds `connectLiveWebRTC()` for browsers, and the playground uses WebRTC with standby when the gate is on, falling back to the WebSocket relay.
