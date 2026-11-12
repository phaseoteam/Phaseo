---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Realtime voice sessions started from Chat check their own `chat_realtime_voice` gate, so Chat can open to everyone while API access stays behind `gateway_realtime_voice`. Adds the "Realtime voice in Chat" blog post.
