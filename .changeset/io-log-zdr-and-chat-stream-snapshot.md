---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Never store request or response bodies in Gateway I/O logs for zero data retention workspaces, or for requests whose API key guardrail requires zero data retention. The privacy settings page shows the I/O log switch as off while ZDR endpoints only is on. Streamed Chat Completions now record the whole assistant message (text, reasoning and tool calls) in the I/O log, request classifiers and trace exports when the stream ends without a full final snapshot, rather than only the last chunk.
