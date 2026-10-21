---
"@phaseo/agent-sdk": patch
"@phaseo/sdk": patch
---

Run the Agent SDK and the core SDK in Cloudflare Workers and other runtimes without Node globals: devtools load Node modules only when enabled, `process` reads and exit handlers are guarded, and run IDs come from Web Crypto. Agent runs also treat gateway server-tool calls such as `phaseo:web_search` as already handled, keeping their calls and results in items and stream events instead of failing with "Tool not found".

Streamed answers now contain only text and reasoning deltas. Tool-call argument deltas and the full text that `.done` events repeat no longer leak into them, and streamed items are taken from their done event, not the still-empty added one.

String `instructions` now reach the gateway once per request. Before, the gateway client sent them twice in the `instructions` field, because the run also keeps them as its first system message.

Gateway HTTP failures of a streamed turn are now `AgentGatewayError`s with their request ID and diagnostics, like non-streamed ones. Before, `@phaseo/sdk`'s own error came through unwrapped, because the SDK sends a streamed request on the first read rather than in `create()`.

A failed `agent.stream()` no longer leaves an unhandled promise rejection when the caller reads only a stream and never awaits the result. A resume that is missing a decision now fails before it runs any of the approved tools.

`@phaseo/sdk` has a new `modelLifecycleChecks` option (default `true`). Set it to `false` to skip the `GET /models` lookup before a model's first request. Concurrent first requests for a model now share one lookup. The Agent SDK's gateway client turns the lookup off unless `clientOptions.modelLifecycleChecks` is `true`, so each new client no longer sends an extra `GET /models`. Retired models are still refused, by the gateway, with an `AgentGatewayError`.
