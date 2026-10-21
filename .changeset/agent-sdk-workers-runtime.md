---
"@phaseo/agent-sdk": patch
"@phaseo/sdk": patch
---

Run the Agent SDK and the core SDK in Cloudflare Workers and other runtimes without Node globals: devtools load Node modules only when enabled, `process` reads and exit handlers are guarded, and run IDs come from Web Crypto. Agent runs also treat gateway server-tool calls such as `phaseo:web_search` as already handled, keeping their calls and results in items and stream events instead of failing with "Tool not found".

Streamed answers now contain only text and reasoning deltas. Tool-call argument deltas and the full text that `.done` events repeat no longer leak into them, and streamed items are taken from their done event, not the still-empty added one.
