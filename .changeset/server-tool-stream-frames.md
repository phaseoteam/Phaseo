---
"@phaseo/gateway-api": patch
---

Streaming requests that use gateway server tools (such as `phaseo:web_search`, `phaseo:web_fetch` or `gateway:datetime`) now stream every model turn in the same grammar as a request without server tools:

- `/v1/responses`: each item is sent as `response.output_item.added`, its deltas and done events, then `response.output_item.done`, with `type` and `sequence_number` in every event. A server tool's call is done with its result (`output`, or `error` with status `failed`). A function call the model makes on the last turn, for the client's own tool, now arrives as a whole `function_call` item and is listed in `response.completed`, whose `output` now holds every streamed item. Before, that call came only as argument events and was missing from `response.completed`. Reasoning streams as reasoning events. A last turn the provider returned whole is streamed as items too, and an incomplete last turn ends with `response.incomplete`.
- `/v1/chat/completions`: calls the gateway ran are no longer streamed as `tool_calls`, so the client's own call is not merged into them under the same index. A last turn's tool calls are sent even when the provider returned that turn whole, and reasoning is not repeated.
- `/v1/messages`: every block is sent as `content_block_start`, its deltas and `content_block_stop`, at its own index. `message_start` carries an empty `content` and `usage`. Calls the gateway ran are not sent as `tool_use` blocks. The stream ends with one `message_delta` that holds both the stop reason and usage, then `message_stop`.
