---
"@phaseo/gateway-api": patch
---

Accept more documented request input on `/v1/chat/completions`, `/v1/responses` and `/v1/messages` instead of returning 400:

- An optional top-level field sent as `null` (for example `temperature`, `max_tokens`, `stop`, `tool_choice`, `service_tier`, `metadata`, `reasoning`, `instructions`) is treated as unset. `reasoning.effort: null` is accepted the same way.
- `service_tier: "auto"` is accepted on Chat and Responses and selects no particular tier, as if the field were omitted; `"scale"` is treated as the standard tier. Billing is unchanged.
- Chat accepts `prediction` (forwarded to OpenAI, Mistral and Moonshot models) and `include_reasoning` (reasoning is still returned whenever the model produces it).
- Chat `reasoning` without an effort (`{ max_tokens }`, `{ enabled: true }`, `{ summary }`) no longer gets a default effort of `medium`, so `max_tokens` and the model's own default apply.
- `/v1/messages` accepts `context_management` (context editing with `clear_tool_uses` and `clear_thinking` edits, sent to Anthropic with its beta header and dropped, and reported in `X-Phaseo-Dropped-Params`, on other providers; compaction edits return 400) and `user` (sent to Claude as `metadata.user_id`). When Anthropic applies a context edit, the response returns its `context_management.applied_edits`, on the message and on the final streamed `message_delta`.
- `provider.data_collection: "allow"` and `provider.enforce_distillable_text: false`, the documented defaults, are accepted as no-ops. `"deny"` and `true` still return 400.
