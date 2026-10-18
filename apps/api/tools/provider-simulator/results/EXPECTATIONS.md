# Expected-outcome gate

Mismatches: 24494. Allowed by the allow-list: 24494. **Failing: 0.**

| Kind | Total | Failing |
|---|---|---|
| dropped | 4029 | 0 |
| invented | 5085 | 0 |
| renamed | 130 | 0 |
| wrong_value | 2581 | 0 |
| wrong_type | 5497 | 0 |
| billing_over | 54 | 0 |
| billing_under | 568 | 0 |
| stream_order | 2010 | 0 |
| error_mapping | 4524 | 0 |
| nondeterminism | 16 | 0 |

| Layer | Total | Failing |
|---|---|---|
| executor | 24022 | 0 |
| e2e | 95 | 0 |
| pricing | 377 | 0 |

Billing deltas over all simulated responses: over 1.3373 USD, under -26.3413 USD (sentinel usage of about 128k tokens per response; see AUDIT.md for per-request impact).

## Compared with baseline 2026-10-17.json

Expected-outcome gate on origin/main 6551de1fa3 (17 October, before the cache fix stack), executor layer only; routing:affinity and coverage cases were added after this run.

| | Baseline | Now |
|---|---|---|
| Mismatches (layers in the baseline) | 27217 | 24022 |
| Groups | 913 | 855 |
| Groups fixed since the baseline | | 85 |
| Groups new since the baseline | | 27 |

Fixed groups (largest first):

- 104 providers: `executor|error_mapping|text|chat||chat.param.cache_control|client.status`
- 104 providers: `executor|error_mapping|text|responses||responses.param.cache_control|client.status`
- 88 providers: `executor|dropped|text|messages|stream|resp:max|client.usage.cache_read_input_tokens`
- 85 providers: `executor|invented|text|responses||responses.base|upstream.body.$.prompt_cache_key`
- 54 providers: `executor|billing_over|text|messages|stream|resp:max|billing.uncachedInput`
- 54 providers: `executor|billing_over|text|messages|buffered|resp:max|billing.uncachedInput`
- 23 providers: `executor|dropped|text|chat|stream|resp:max|client.usage.prompt_tokens_details.cached_tokens`
- 15 providers: `executor|billing_over|text|chat|stream|resp:max|billing.uncachedInput`
- 12 providers: `executor|dropped|text|messages|stream|resp:max|client.usage.cache_creation_input_tokens`
- 11 providers: `executor|dropped|text|chat|stream|resp:max|client.usage.prompt_tokens_details.cache_write_tokens`
- 11 providers: `executor|dropped|text|responses|stream|resp:max|client.usage.input_tokens_details.cache_write_tokens`
- 8 providers: `executor|invented|text|responses||responses.param.conversation|upstream.body.$.conversation`
- 8 providers: `executor|dropped|text|chat|stream|resp:max|client.reasoning.state`
- 7 providers: `executor|dropped|text|messages|stream|resp:max|client.reasoning.redacted_thinking`
- 7 providers: `executor|dropped|text|messages|stream|resp:max|client.usage.cache_creation.ephemeral_5m_input_tokens`
- 7 providers: `executor|dropped|text|messages|stream|resp:max|client.usage.cache_creation.ephemeral_1h_input_tokens`
- 7 providers: `executor|dropped|text|responses|stream|resp:max|client.reasoning.state`
- 7 providers: `executor|dropped|text|responses|buffered|resp:max|client.reasoning.state`
- 6 providers: `executor|billing_under|text|messages|stream|resp:max|billing.write5m`
- 6 providers: `executor|billing_under|text|messages|stream|resp:max|billing.write1h`
- 6 providers: `executor|dropped|text|chat||chat.param.user_id|upstream.body.$.metadata.user_id`
- 6 providers: `executor|renamed|text|chat||chat.param.user|upstream.body.$.metadata.user_id`
- 6 providers: `executor|renamed|text|responses||responses.param.user|upstream.body.$.metadata.user_id`
- 6 providers: `executor|dropped|text|chat||chat.content.developer-role|upstream.body(client $.messages[].content)`
- 6 providers: `executor|dropped|text|chat||chat.content.second-system|upstream.body(client $.messages[].content)`
- 6 providers: `executor|dropped|text|responses||responses.content.developer-role|upstream.body(client $.input[].content)`
- 6 providers: `executor|dropped|text|responses|buffered|roundtrip:responses|roundtrip.upstream.thinking_signature`
- 6 providers: `executor|dropped|text|responses|buffered|roundtrip:responses|roundtrip.upstream.redacted_thinking`
- 5 providers: `executor|error_mapping|text|responses||responses.param.previous_response_id|upstream.call`
- 5 providers: `executor|error_mapping|text|responses||responses.param.conversation|upstream.call`
- 5 providers: `executor|billing_under|text|chat|stream|resp:max|billing.write5m`
- 5 providers: `executor|billing_under|text|chat|stream|resp:max|billing.write1h`
- 5 providers: `executor|billing_under|text|chat|buffered|resp:max|billing.write5m`
- 5 providers: `executor|billing_under|text|chat|buffered|resp:max|billing.write1h`
- 5 providers: `executor|billing_under|text|responses|stream|resp:max|billing.write5m`
- 5 providers: `executor|billing_under|text|responses|stream|resp:max|billing.write1h`
- 5 providers: `executor|billing_under|text|responses|buffered|resp:max|billing.write5m`
- 5 providers: `executor|billing_under|text|responses|buffered|resp:max|billing.write1h`
- 4 providers: `executor|dropped|text|responses|buffered|roundtrip:responses|roundtrip.upstream.encrypted_reasoning`
- 3 providers: `executor|billing_over|text|responses|stream|resp:max|billing.uncachedInput`
- 3 providers: `executor|billing_under|text|messages|stream|resp:max|billing.write`
- 3 providers: `executor|billing_under|text|chat|stream|resp:max|billing.write`
- 3 providers: `executor|billing_under|text|chat|buffered|resp:max|billing.write`
- 3 providers: `executor|dropped|text|chat||chat.param.prompt_cache_retention|upstream.body.$.prompt_cache_retention`
- 3 providers: `executor|dropped|text|responses||responses.param.prompt_cache_retention|upstream.body.$.prompt_cache_retention`
- 2 providers: `executor|dropped|text|chat||chat.agentN.stepN|upstream.body(client $.messages[].tool_calls[].function.arguments)`
- 2 providers: `executor|dropped|text|responses||responses.agentN.stepN|upstream.body(client $.input[].arguments)`
- 2 providers: `executor|dropped|text|messages||messages.agentN.stepN|upstream.body(client $.messages[].content[].input.sim_arg_city)`
- 2 providers: `executor|dropped|text|messages||messages.agentN.stepN|upstream.body(client $.messages[].content[].input.sim_arg_query)`
- 2 providers: `executor|dropped|text|chat||chat.agentN.step9|upstream.body(client $.messages[].tool_calls[].function.arguments)`
- 2 providers: `executor|dropped|text|responses||responses.agentN.step9|upstream.body(client $.input[].arguments)`
- 2 providers: `executor|dropped|text|messages||messages.agentN.step9|upstream.body(client $.messages[].content[].input.sim_arg_city)`
- 2 providers: `executor|dropped|text|messages||messages.agentN.step9|upstream.body(client $.messages[].content[].input.sim_arg_query)`
- 2 providers: `executor|dropped|text|chat||chat.agent3.step3|upstream.body(client $.messages[].tool_calls[].function.arguments)`
- 2 providers: `executor|dropped|text|responses||responses.agent3.step3|upstream.body(client $.input[].arguments)`
- 2 providers: `executor|invented|text|responses||responses.param.previous_response_id|upstream.body.$.previous_response_id`
- 2 providers: `executor|dropped|text|chat||chat.agent.step2|upstream.body(client $.messages[].tool_calls[].function.arguments)`
- 2 providers: `executor|dropped|text|chat||chat.agent.step3|upstream.body(client $.messages[].tool_calls[].function.arguments)`
- 2 providers: `executor|dropped|text|responses||responses.agent.step2|upstream.body(client $.input[].arguments)`
- 2 providers: `executor|dropped|text|responses||responses.agent.step3|upstream.body(client $.input[].arguments)`
- 2 providers: `executor|dropped|text|chat||chat.agent3.step2|upstream.body(client $.messages[].tool_calls[].function.arguments)`
- 2 providers: `executor|dropped|text|responses||responses.agent3.step2|upstream.body(client $.input[].arguments)`
- 2 providers: `executor|dropped|text|messages||messages.agent3.step3|upstream.body(client $.messages[].content[].input.sim_arg_city)`
- 2 providers: `executor|dropped|text|messages||messages.agent3.step3|upstream.body(client $.messages[].content[].input.sim_arg_query)`
- 2 providers: `executor|dropped|text|chat|stream|resp:max|client.tool_call.id`
- 2 providers: `executor|dropped|text|responses|stream|resp:max|client.tool_call.id`
- 2 providers: `executor|billing_under|text|responses|stream|resp:max|billing.write`
- 2 providers: `executor|dropped|text|messages||messages.agent.step2|upstream.body(client $.messages[].content[].input.sim_arg_city)`
- 2 providers: `executor|dropped|text|messages||messages.agent.step2|upstream.body(client $.messages[].content[].input.sim_arg_query)`
- 2 providers: `executor|dropped|text|messages||messages.agent.step3|upstream.body(client $.messages[].content[].input.sim_arg_city)`
- 2 providers: `executor|dropped|text|messages||messages.agent.step3|upstream.body(client $.messages[].content[].input.sim_arg_query)`
- 2 providers: `executor|dropped|text|messages||messages.agent3.step2|upstream.body(client $.messages[].content[].input.sim_arg_city)`
- 2 providers: `executor|dropped|text|messages||messages.agent3.step2|upstream.body(client $.messages[].content[].input.sim_arg_query)`
- 2 providers: `executor|dropped|text|responses|buffered|roundtrip:responses|roundtrip.upstream.function_call_thought_signature`
- 1 providers: `executor|dropped|text|responses||responses.param.previous_response_id|upstream.body.$.previous_response_id`
- 1 providers: `executor|dropped|text|chat||chat.param.reasoning_effort=instant|upstream.body.$.reasoning.effort`
- 1 providers: `executor|dropped|text|responses|buffered|roundtrip:responses|roundtrip.upstream.thought_signature`
- 1 providers: `executor|billing_over|text|chat|stream|resp:max|billing.output`
- 1 providers: `executor|billing_under|text|chat|stream|resp:max|billing.reasoning`
- 1 providers: `executor|billing_over|text|messages|stream|resp:max|billing.output`

New groups:

- 104 providers: `executor|error_mapping|text|responses||responses.param.previous_response_id|client.status`
- 5 providers: `executor|error_mapping|text|chat||chat.param.prompt_cache_retention=in_memory|upstream.call`
- 5 providers: `executor|error_mapping|text|chat||chat.param.prompt_cache_options|upstream.call`
- 5 providers: `executor|error_mapping|text|chat||chat.param.cache_control|upstream.call`
- 5 providers: `executor|error_mapping|text|responses||responses.param.prompt_cache_retention=in_memory|upstream.call`
- 5 providers: `executor|error_mapping|text|responses||responses.param.prompt_cache_options|upstream.call`
- 5 providers: `executor|error_mapping|text|responses||responses.param.cache_control|upstream.call`
- 5 providers: `executor|error_mapping|text|messages||messages.param.cache_control|upstream.call`
- 3 providers: `executor|dropped|text|chat||chat.param.stream_options|upstream.body.$.stream_options.include_usage`
- 2 providers: `executor|renamed|text|chat|stream|resp:max|billing.write.meter`
- 2 providers: `executor|renamed|text|chat|buffered|resp:max|billing.write.meter`
- 2 providers: `executor|renamed|text|responses|stream|resp:max|billing.write.meter`
- 2 providers: `executor|renamed|text|messages|stream|resp:max|billing.write.meter`
- 2 providers: `executor|invented|text|responses||responses.base|upstream.body.$.include`
- 2 providers: `executor|invented|text|messages||messages.base|upstream.body.$.include`
- 1 providers: `executor|wrong_type|text|chat||chat.param.reasoning|upstream.body.$.reasoning_effort`
- 1 providers: `executor|wrong_type|text|responses||responses.param.reasoning|upstream.body.$.reasoning_effort`
- 1 providers: `executor|billing_over|text|messages|stream|resp:max|billing.read`
- 1 providers: `executor|renamed|text|chat||chat.base|upstream.header.authorization`
- 1 providers: `executor|renamed|text|responses||responses.base|upstream.header.authorization`
- 1 providers: `executor|renamed|text|responses|buffered|resp:max|billing.write.meter`
- 1 providers: `executor|renamed|text|chat|stream|resp:max|billing.output.meter`
- 1 providers: `executor|renamed|text|messages|stream|resp:max|billing.output.meter`
- 1 providers: `executor|renamed|text|messages|buffered|resp:max|billing.output.meter`
- 1 providers: `executor|dropped|text|chat||chat.param.user_id|upstream.body.$.user`
- 1 providers: `executor|dropped|text|chat||chat.param.user|upstream.body.$.user`
- 1 providers: `executor|dropped|text|responses||responses.param.user|upstream.body.$.user`

## Failing (0 groups)

| Kind | Layer | Surface/mode | Case | Path | Providers | Expected | Actual | Δ nanos | Source | Allow-list |
|---|---|---|---|---|---|---|---|---|---|---|

## Allowed (1119 groups)

| Kind | Layer | Surface/mode | Case | Path | Providers | Expected | Actual | Δ nanos | Source | Allow-list |
|---|---|---|---|---|---|---|---|---|---|---|
| error_mapping | executor | responses | responses.param.previous_response_id | client.status | 104: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … | 200 | 400 |  | apps/docs/v1/api-reference/parameters.mdx | request-previous-response-id |
| error_mapping | executor | messages | messages.param.service_tier | client.status | 104: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … | 200 | 400 |  | apps/docs/v1/guides/service-tiers.mdx | request-messages-params |
| error_mapping | executor | messages | messages.param.session_id | client.status | 104: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … | 200 | 400 |  | spec apps/docs/openapi/v1/openapi.yaml #/components/schemas/ChatComple | request-messages-params |
| error_mapping | executor | messages | messages.param.reasoning | client.status | 104: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … | 200 | 400 |  | apps/docs/v1/api-reference/parameters.mdx | request-messages-params |
| error_mapping | executor | messages | messages.param.provider_options | client.status | 104: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … | 200 | 400 |  | apps/docs/v1/guides/prompt-caching.mdx | request-messages-params |
| error_mapping | executor | chat | chat.content.part.file_data | client.status | 104: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … | 200 | 400 |  | assumed: The request shape is documented by the API the surface mirror | request-rejected-sdk-shapes |
| error_mapping | executor | chat | chat.content.part.file_id | client.status | 104: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … | 200 | 400 |  | assumed: The request shape is documented by the API the surface mirror | request-rejected-sdk-shapes |
| error_mapping | executor | chat | chat.content.assistant-null-content | client.status | 104: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … | 200 | 400 |  | https://platform.openai.com/docs/api-reference/chat/create | request-rejected-sdk-shapes |
| error_mapping | executor | messages | messages.cache.anthropic-agent-scope | client.status | 104: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … | 200 | 400 |  | assumed: The request shape is documented by the API the surface mirror | request-messages-params |
| wrong_type | executor | chat | chat.agent10.step10 | upstream.body(client $.messages[].content[].text) | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | structured value | embedded in a JSON string |  | assumed: Every value the client sends in content, tools or history mus | request-content-values |
| wrong_type | executor | responses | responses.agent10.step10 | upstream.body(client $.input[].output[].text) | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | structured value | embedded in a JSON string |  | assumed: Every value the client sends in content, tools or history mus | request-content-values |
| dropped | executor | chat/buffered | resp:max | client.citations | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | https://sim.example/cite-0001 |  |  | https://platform.openai.com/docs/api-reference/chat/object | stream-citations-refusal |
| dropped | executor | chat/buffered | resp:finish:refusal | client.refusal | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | SIM-UPSTREAM-REFUSAL-0001 cannot help with that |  |  | https://platform.openai.com/docs/api-reference/chat/object | stream-citations-refusal |
| dropped | executor | messages/stream | resp:max | client.citations | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | https://sim.example/cite-0001 |  |  | https://docs.anthropic.com/en/docs/build-with-claude/citations | stream-citations-refusal |
| dropped | executor | messages/buffered | resp:max | client.citations | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | https://sim.example/cite-0001 |  |  | https://docs.anthropic.com/en/docs/build-with-claude/citations | stream-citations-refusal |
| wrong_value | executor | messages/buffered | resp:finish:content_filter | client.finish | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | ["refusal"] | end_turn |  | https://docs.anthropic.com/en/api/messages | stream-finish-mapping |
| wrong_value | executor | messages/stream | resp:finish:stop_sequence | client.finish | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | ["stop_sequence"] | end_turn |  | https://docs.anthropic.com/en/api/messages | stream-finish-mapping |
| wrong_value | executor | messages/buffered | resp:finish:stop_sequence | client.finish | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | ["stop_sequence"] | end_turn |  | https://docs.anthropic.com/en/api/messages | stream-finish-mapping |
| wrong_value | executor | messages/stream | resp:finish:pause_turn | client.finish | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | ["pause_turn"] | end_turn |  | https://docs.anthropic.com/en/api/messages | stream-finish-mapping |
| wrong_value | executor | messages/buffered | resp:finish:pause_turn | client.finish | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | ["pause_turn"] | end_turn |  | https://docs.anthropic.com/en/api/messages | stream-finish-mapping |
| dropped | executor | messages/stream | resp:finish:refusal | client.refusal | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | SIM-UPSTREAM-REFUSAL-0001 cannot help with that |  |  | https://docs.anthropic.com/en/api/messages | stream-citations-refusal |
| wrong_value | executor | messages/buffered | resp:finish:refusal | client.finish | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | ["refusal"] | end_turn |  | https://docs.anthropic.com/en/api/messages | stream-finish-mapping |
| dropped | executor | messages/buffered | resp:finish:refusal | client.refusal | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | SIM-UPSTREAM-REFUSAL-0001 cannot help with that |  |  | https://docs.anthropic.com/en/api/messages | stream-citations-refusal |
| wrong_type | executor | chat | chat.agent.step2 | upstream.body(client $.messages[].content[].text) | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | structured value | embedded in a JSON string |  | assumed: Every value the client sends in content, tools or history mus | request-content-values |
| wrong_type | executor | chat | chat.agent.step3 | upstream.body(client $.messages[].content[].text) | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | structured value | embedded in a JSON string |  | assumed: Every value the client sends in content, tools or history mus | request-content-values |
| wrong_type | executor | responses | responses.agent.step2 | upstream.body(client $.input[].output[].text) | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | structured value | embedded in a JSON string |  | assumed: Every value the client sends in content, tools or history mus | request-content-values |
| wrong_type | executor | responses | responses.agent.step3 | upstream.body(client $.input[].output[].text) | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | structured value | embedded in a JSON string |  | assumed: Every value the client sends in content, tools or history mus | request-content-values |
| wrong_type | executor | chat | chat.agent10.step9 | upstream.body(client $.messages[].content[].text) | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | structured value | embedded in a JSON string |  | assumed: Every value the client sends in content, tools or history mus | request-content-values |
| wrong_type | executor | responses | responses.agent10.step9 | upstream.body(client $.input[].output[].text) | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | structured value | embedded in a JSON string |  | assumed: Every value the client sends in content, tools or history mus | request-content-values |
| wrong_value | executor | messages/stream | resp:finish:refusal | client.finish | 98: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | ["refusal"] | end_turn |  | https://docs.anthropic.com/en/api/messages | stream-finish-mapping |
| dropped | executor | chat | chat.content.system-parts | upstream.body(client $.messages[].name) | 97: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … | sim-user-name |  |  | assumed: Every value the client sends in content, tools or history mus | request-content-values |
| error_mapping | executor | chat/buffered | resp:error:mid-stream | client.error | 97: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | error event or error status | no error surfaced |  | apps/docs/v1/guides/streaming.mdx | stream-midstream-errors |
| error_mapping | executor | chat/buffered | resp:error:mid-stream | client.finish | 97: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | no successful terminal event | stop |  | apps/docs/v1/guides/streaming.mdx | stream-midstream-errors |
| wrong_value | executor | messages/buffered | resp:finish:length | client.finish | 97: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | ["max_tokens"] | end_turn |  | https://docs.anthropic.com/en/api/messages | stream-finish-mapping |
| error_mapping | executor | messages/stream | resp:error:mid-stream | client.error | 97: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | error event or error status | no error surfaced |  | apps/docs/v1/guides/streaming.mdx | stream-midstream-errors |
| error_mapping | executor | messages/stream | resp:error:mid-stream | client.finish | 97: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | no successful terminal event | end_turn |  | apps/docs/v1/guides/streaming.mdx | stream-midstream-errors |
| error_mapping | executor | messages/buffered | resp:error:mid-stream | client.error | 97: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | error event or error status | no error surfaced |  | apps/docs/v1/guides/streaming.mdx | stream-midstream-errors |
| error_mapping | executor | messages/buffered | resp:error:mid-stream | client.finish | 97: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | no successful terminal event | end_turn |  | apps/docs/v1/guides/streaming.mdx | stream-midstream-errors |
| stream_order | executor | chat/stream | resp:finish:refusal | client.stream | 95: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | [DONE] is the last frame | missing [DONE] |  | https://platform.openai.com/docs/api-reference/chat-streaming | stream-grammar |
| stream_order | executor | chat/stream | resp:text | client.stream | 95: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | [DONE] is the last frame | missing [DONE] |  | https://platform.openai.com/docs/api-reference/chat-streaming | stream-grammar |
| stream_order | executor | chat/stream | resp:max | client.stream | 95: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | [DONE] is the last frame | missing [DONE] |  | https://platform.openai.com/docs/api-reference/chat-streaming | stream-grammar |
| stream_order | executor | chat/stream | resp:finish:length | client.stream | 95: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | [DONE] is the last frame | missing [DONE] |  | https://platform.openai.com/docs/api-reference/chat-streaming | stream-grammar |
| stream_order | executor | chat/stream | resp:finish:content_filter | client.stream | 95: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | [DONE] is the last frame | missing [DONE] |  | https://platform.openai.com/docs/api-reference/chat-streaming | stream-grammar |
| stream_order | executor | chat/stream | resp:finish:stop_sequence | client.stream | 95: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | [DONE] is the last frame | missing [DONE] |  | https://platform.openai.com/docs/api-reference/chat-streaming | stream-grammar |
| stream_order | executor | chat/stream | resp:finish:pause_turn | client.stream | 95: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | [DONE] is the last frame | missing [DONE] |  | https://platform.openai.com/docs/api-reference/chat-streaming | stream-grammar |
| invented | executor | chat | chat.base | upstream.body.$.temperature | 91: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … |  | 1 |  | assumed: Phaseo streams every text request upstream and buffers on its | request-invented-defaults |
| invented | executor | chat | chat.base | upstream.body.$.parallel_tool_calls | 85: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … |  | true |  | assumed: Phaseo streams every text request upstream and buffers on its | request-invented-defaults |
| dropped | executor | messages/buffered | resp:max | client.usage.cache_read_input_tokens | 85: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, ambient, … | 20011 | null |  | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| invented | executor | chat | chat.param.image_config | upstream.body.$.image_config | 83: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … |  | {"aspect_ratio":"16:9"} |  | spec specs/ai21.json properties.image_config | request-unsupported-forwarded |
| invented | executor | responses | responses.param.image_config | upstream.body.$.image_config | 83: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … |  | {"aspect_ratio":"sim-aspect-ratio","image_size":"0 |  | spec specs/ai21.json properties.image_config | request-unsupported-forwarded |
| invented | executor | responses | responses.base | upstream.body.$.safety_identifier | 80: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … |  | null |  | assumed: Phaseo streams every text request upstream and buffers on its | request-invented-defaults |
| dropped | executor | responses/stream | resp:max | client.citations | 77: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | https://sim.example/cite-0001 |  |  | spec apps/docs/openapi/v1/openapi.yaml #/components/schemas/ResponsesR | stream-citations-refusal |
| dropped | executor | responses/buffered | resp:max | client.citations | 77: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | https://sim.example/cite-0001 |  |  | spec apps/docs/openapi/v1/openapi.yaml #/components/schemas/ResponsesR | stream-citations-refusal |
| dropped | executor | responses/stream | resp:finish:refusal | client.refusal | 77: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | SIM-UPSTREAM-REFUSAL-0001 cannot help with that |  |  | https://platform.openai.com/docs/api-reference/responses/object | stream-citations-refusal |
| dropped | executor | responses/buffered | resp:finish:refusal | client.refusal | 77: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | SIM-UPSTREAM-REFUSAL-0001 cannot help with that |  |  | https://platform.openai.com/docs/api-reference/responses/object | stream-citations-refusal |
| invented | executor | chat | chat.param.max_tool_calls | upstream.body.$.max_tool_calls | 76: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, arcee-ai, … |  | 9 |  | spec specs/aion-labs.json properties.max_tool_calls | request-unsupported-forwarded |
| stream_order | executor | responses/stream | resp:text | client.stream | 76: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | output_item.added before deltas of that item | response.output_text.delta |  | https://platform.openai.com/docs/api-reference/responses-streaming | stream-grammar |
| stream_order | executor | responses/stream | resp:max | client.stream | 76: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | output_item.added before deltas of that item | response.reasoning_text.delta |  | https://platform.openai.com/docs/api-reference/responses-streaming | stream-grammar |
| stream_order | executor | responses/stream | resp:finish:length | client.stream | 76: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | output_item.added before deltas of that item | response.output_text.delta |  | https://platform.openai.com/docs/api-reference/responses-streaming | stream-grammar |
| stream_order | executor | responses/stream | resp:finish:content_filter | client.stream | 76: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | output_item.added before deltas of that item | response.output_text.delta |  | https://platform.openai.com/docs/api-reference/responses-streaming | stream-grammar |
| stream_order | executor | responses/stream | resp:finish:stop_sequence | client.stream | 76: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | output_item.added before deltas of that item | response.output_text.delta |  | https://platform.openai.com/docs/api-reference/responses-streaming | stream-grammar |
| stream_order | executor | responses/stream | resp:finish:pause_turn | client.stream | 76: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | output_item.added before deltas of that item | response.output_text.delta |  | https://platform.openai.com/docs/api-reference/responses-streaming | stream-grammar |
| error_mapping | executor | responses/stream | resp:error:mid-stream | client.error | 76: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | error event or error status | no error surfaced |  | apps/docs/v1/guides/streaming.mdx | stream-midstream-errors |
| error_mapping | executor | responses/buffered | resp:error:mid-stream | client.error | 76: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | error event or error status | no error surfaced |  | apps/docs/v1/guides/streaming.mdx | stream-midstream-errors |
| error_mapping | executor | responses/buffered | resp:error:mid-stream | client.finish | 76: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, anthropic-, … | no successful terminal event | completed |  | apps/docs/v1/guides/streaming.mdx | stream-midstream-errors |
| invented | executor | chat | chat.base | upstream.body.$.logprobs | 74: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … |  | false |  | assumed: Phaseo streams every text request upstream and buffers on its | request-invented-defaults |
| error_mapping | executor | responses/stream | resp:error:mid-stream | client.finish | 71: aion-labs, akashml, alibaba-cloud, alibaba, arcee-ai, atlascloud, … | no successful terminal event | completed |  | apps/docs/v1/guides/streaming.mdx | stream-midstream-errors |
| invented | executor | responses | responses.param.max_tool_calls | upstream.body.$.max_tool_calls | 70: aion-labs, akashml, alibaba-cloud, alibaba, arcee-ai, atlascloud, … |  | 9 |  | spec specs/aion-labs.json properties.max_tool_calls | request-unsupported-forwarded |
| invented | executor | responses | responses.param.background | upstream.body.$.background | 67: ai21, aion-labs, akashml, alibaba-cloud, alibaba, arcee-ai, … |  | false |  | apps/docs/v1/api-reference/parameters.mdx | request-unsupported-forwarded |
| invented | executor | chat | chat.param.min_p | upstream.body.$.min_p | 65: ai21, aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, … |  | 0.07 |  | spec specs/ai21.json properties.min_p | request-unsupported-forwarded |
| dropped | executor | chat/buffered | resp:max | client.usage.completion_tokens_details.reasoning_tokens | 63: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, arcee-ai, … | 1109 |  |  | apps/docs/v1/guides/prompt-caching.mdx | billing-usage-reasoning-field |
| dropped | executor | chat/stream | resp:max | client.usage.completion_tokens_details.reasoning_tokens | 60: aion-labs, akashml, alibaba-cloud, alibaba, amazon-bedrock, arcee-ai, … | 1109 |  |  | apps/docs/v1/guides/prompt-caching.mdx | billing-usage-reasoning-field |
| invented | executor | chat | chat.param.web_search_options | upstream.body.$.web_search_options | 59: ai21, aion-labs, akashml, alibaba-cloud, ambient, arcee-ai, … |  | {"search_context_size":"low","user_location":{"typ |  | spec specs/ai21.json properties.web_search_options | request-unsupported-forwarded |
| invented | executor | chat | chat.param.repetition_penalty | upstream.body.$.repetition_penalty | 59: ai21, aion-labs, akashml, alibaba, amazon-bedrock, atlascloud, … |  | 1.07 |  | spec specs/ai21.json properties.repetition_penalty | request-unsupported-forwarded |
| billing_under | executor | messages/buffered | resp:max | billing.read | 57: aion-labs, akashml, alibaba-cloud, amazon-bedrock, ambient, anthropic-, … | {"tokens":20011,"nanos":15008250,"meter":"cached_r | {"tokens":0,"nanos":0} | -785366830 | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| invented | executor | chat | chat.param.top_k | upstream.body.$.top_k | 56: ai21, aion-labs, akashml, alibaba, amazon-bedrock, atlascloud, … |  | 41 |  | spec specs/ai21.json properties.top_k | request-unsupported-forwarded |
| invented | executor | responses | responses.param.modalities | upstream.body.$.modalities | 55: ai21, aion-labs, amazon-bedrock, ambient, avian, azure, … |  | ["text"] |  | spec specs/ai21.json properties.modalities | request-unsupported-forwarded |
| invented | executor | messages | messages.param.top_k | upstream.body.$.top_k | 53: ai21, aion-labs, akashml, alibaba, atlascloud, avian, … |  | 41 |  | spec specs/ai21.json properties.top_k | request-unsupported-forwarded |
| invented | executor | chat | chat.param.modalities | upstream.body.$.modalities | 50: ai21, aion-labs, ambient, avian, baidu, baseten, … |  | ["text","audio"] |  | spec specs/ai21.json properties.modalities | request-unsupported-forwarded |
| renamed | executor | messages | messages.param.metadata | upstream.body.$.user | 50: akashml, alibaba, ambient, arcee-ai, atlascloud, azure, … | sim-user-meta-4c3 | at $.metadata.user_id |  | spec specs/akashml.json properties.user | request-params-dropped-or-changed |
| invented | executor | responses | responses.param.top_k | upstream.body.$.top_k | 50: ai21, aion-labs, akashml, alibaba, atlascloud, avian, … |  | 41 |  | spec specs/ai21.json properties.top_k | request-unsupported-forwarded |
| wrong_value | executor | responses | responses.param.prompt_cache_key | upstream.body.$.prompt_cache_key | 48: alibaba, amazon-bedrock, arcee-ai, atlascloud, azure, baidu, … | hash of workspace and key | sim-pck-7a3 |  | apps/docs/v1/guides/prompt-caching.mdx | request-params-dropped-or-changed |
| wrong_value | executor | chat | chat.param.prompt_cache_key | upstream.body.$.prompt_cache_key | 47: alibaba, amazon-bedrock, arcee-ai, atlascloud, azure, bytedance-seed, … | hash of workspace and key | sim-pck-7a3 |  | apps/docs/v1/guides/prompt-caching.mdx | request-params-dropped-or-changed |
| dropped | executor | responses/buffered | resp:max | client.reasoning.text | 46: aion-labs, akashml, alibaba-cloud, alibaba, arcee-ai, atlascloud, … | SIM-UPSTREAM-REASONING-0001 check the tool output  |  |  | apps/docs/v1/api-reference/endpoint/responses.mdx | reasoning-roundtrip |
| invented | executor | responses | responses.param.seed | upstream.body.$.seed | 46: ai21, aion-labs, amazon-bedrock, ambient, avian, azure, … |  | 424242 |  | spec specs/ai21.json properties.seed | request-unsupported-forwarded |
| invented | executor | chat | chat.param.logit_bias | upstream.body.$.logit_bias | 46: ai21, aion-labs, alibaba-cloud, ambient, avian, baidu, … |  | {"1729":7} |  | spec specs/ai21.json properties.logit_bias | request-unsupported-forwarded |
| dropped | executor | chat | chat.param.store | upstream.body.$.store | 43: alibaba, amazon-bedrock, ambient, atlascloud, azure, bytedance-seed, … | true |  |  | assumed: Phaseo does not document store; OpenAI-dialect providers that | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.safety_identifier | upstream.body.$.safety_identifier | 42: ai21, aion-labs, akashml, alibaba-cloud, ambient, arcee-ai, … |  | sim-safety-9d2 |  | spec specs/ai21.json properties.safety_identifier | request-unsupported-forwarded |
| wrong_value | executor | responses | responses.param.service_tier=batch | upstream.body.$.service_tier | 42: alibaba, amazon-bedrock, atlascloud, baidu, bytedance-seed, byteplus, … | one of ["auto","default","flex","scale","priority" | batch |  | assumed: no alibaba spec; OpenAI schema (openai) used as a stand-in at | request-params-dropped-or-changed |
| invented | executor | responses | responses.param.safety_identifier | upstream.body.$.safety_identifier | 41: ai21, aion-labs, akashml, alibaba-cloud, ambient, arcee-ai, … |  | sim-safety-9d2 |  | spec specs/ai21.json properties.safety_identifier | request-unsupported-forwarded |
| wrong_value | executor | chat | chat.param.service_tier=batch | upstream.body.$.service_tier | 41: alibaba, amazon-bedrock, atlascloud, bytedance-seed, byteplus, cerebra, … | one of ["auto","default","flex","scale","priority" | batch |  | assumed: no alibaba spec; OpenAI schema (openai) used as a stand-in at | request-params-dropped-or-changed |
| wrong_value | executor | responses | responses.param.service_tier=default | upstream.body.$.service_tier | 41: akashml, alibaba, amazon-bedrock, atlascloud, baidu, bytedance-seed, … | default | standard |  | apps/docs/v1/guides/service-tiers.mdx | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.seed | upstream.body.$.seed | 40: ai21, aion-labs, ambient, avian, byteplus, canopy-wave, … |  | 424242 |  | spec specs/ai21.json properties.seed | request-unsupported-forwarded |
| wrong_value | executor | chat | chat.param.service_tier=default | upstream.body.$.service_tier | 40: akashml, alibaba, amazon-bedrock, atlascloud, bytedance-seed, byteplus, … | default | standard |  | apps/docs/v1/guides/service-tiers.mdx | request-params-dropped-or-changed |
| wrong_value | executor | messages | messages.param.service_tier=batch | upstream.body.$.service_tier | 40: alibaba, atlascloud, bytedance-seed, byteplus, cerebras, clarifai, … | one of ["auto","default","flex","scale","priority" | batch |  | assumed: no alibaba spec; OpenAI schema (openai) used as a stand-in at | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.logprobs | upstream.body.$.logprobs | 40: ai21, aion-labs, ambient, avian, baidu, byteplus, … |  | true |  | spec specs/ai21.json properties.logprobs | request-unsupported-forwarded |
| wrong_value | executor | messages | messages.param.service_tier=default | upstream.body.$.service_tier | 39: akashml, alibaba, atlascloud, bytedance-seed, byteplus, clarifai, … | default | standard |  | apps/docs/v1/guides/service-tiers.mdx | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.metadata | upstream.body.$.metadata.sim_meta_key | 38: ai21, akashml, alibaba-cloud, avian, baseten, canopy-wave, … |  | sim-meta-value-55 |  | spec specs/ai21.json properties.metadata | request-unsupported-forwarded |
| invented | executor | responses | responses.param.metadata | upstream.body.$.metadata.sim_meta_key | 38: ai21, akashml, alibaba-cloud, avian, baseten, canopy-wave, … |  | sim-meta-value-55 |  | spec specs/ai21.json properties.metadata | request-unsupported-forwarded |
| wrong_value | executor | responses | responses.param.service_tier=standard | upstream.body.$.service_tier | 37: alibaba, amazon-bedrock, atlascloud, baidu, bytedance-seed, byteplus, … | one of ["auto","default","flex","scale","priority" | standard |  | assumed: no alibaba spec; OpenAI schema (openai) used as a stand-in at | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.user_id | upstream.body.$.user | 36: ai21, aion-labs, alibaba-cloud, avian, canopy-wave, chutes, … |  | sim-user-id-4c2 |  | spec specs/ai21.json properties.user | request-unsupported-forwarded |
| invented | executor | chat | chat.param.user | upstream.body.$.user | 36: ai21, aion-labs, alibaba-cloud, avian, canopy-wave, chutes, … |  | sim-user-4c1 |  | spec specs/ai21.json properties.user | request-unsupported-forwarded |
| invented | executor | responses | responses.param.user | upstream.body.$.user | 36: ai21, aion-labs, alibaba-cloud, avian, canopy-wave, chutes, … |  | sim-user-4c1 |  | spec specs/ai21.json properties.user | request-unsupported-forwarded |
| wrong_value | executor | chat | chat.param.service_tier=standard | upstream.body.$.service_tier | 36: alibaba, amazon-bedrock, atlascloud, bytedance-seed, byteplus, clarifa, … | one of ["auto","default","flex","scale","priority" | standard |  | assumed: no alibaba spec; OpenAI schema (openai) used as a stand-in at | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.prompt_cache_key | upstream.body.$.prompt_cache_key | 35: ai21, aion-labs, akashml, alibaba-cloud, ambient, avian, … |  | sim-pck-7a3 |  | spec specs/ai21.json properties.prompt_cache_key | request-unsupported-forwarded |
| invented | executor | chat | chat.param.tools | upstream.body.$.tools.0.function.name | 35: aion-labs, alibaba-cloud, arcee-ai, avian, baidu, canopy-wave, … |  | sim_tool_weather |  | spec specs/aion-labs.json properties.tools.items | request-unsupported-forwarded |
| invented | executor | chat | chat.param.service_tier | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | flex |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | chat | chat.param.service_tier=standard | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | standard |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | chat | chat.param.service_tier=default | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | standard |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | chat | chat.param.service_tier=fast | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | fast |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | chat | chat.param.service_tier=ultrafast | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | ultrafast |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | chat | chat.param.service_tier=priority | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | priority |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | chat | chat.param.service_tier=batch | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | batch |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | messages | messages.param.tools | upstream.body.$.tools.0.function.name | 35: aion-labs, alibaba-cloud, arcee-ai, avian, baidu, canopy-wave, … |  | sim_tool_weather |  | spec specs/aion-labs.json properties.tools.items | request-unsupported-forwarded |
| invented | executor | messages | messages.param.service_tier=standard | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | standard |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | messages | messages.param.service_tier=default | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | standard |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | messages | messages.param.service_tier=fast | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | fast |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | messages | messages.param.service_tier=ultrafast | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | ultrafast |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | messages | messages.param.service_tier=priority | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | priority |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | messages | messages.param.service_tier=flex | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | flex |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | messages | messages.param.service_tier=batch | upstream.body.$.service_tier | 35: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | batch |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| wrong_value | executor | chat | chat.param.service_tier=ultrafast | upstream.body.$.service_tier | 35: alibaba, amazon-bedrock, atlascloud, bytedance-seed, cerebras, cloudfl, … | one of ["auto","default","flex","scale","priority" | ultrafast |  | assumed: no alibaba spec; OpenAI schema (openai) used as a stand-in at | request-params-dropped-or-changed |
| wrong_value | executor | messages | messages.param.service_tier=standard | upstream.body.$.service_tier | 35: alibaba, atlascloud, bytedance-seed, byteplus, clarifai, cloudflare, … | one of ["auto","default","flex","scale","priority" | standard |  | assumed: no alibaba spec; OpenAI schema (openai) used as a stand-in at | request-params-dropped-or-changed |
| invented | executor | responses | responses.param.prompt_cache_key | upstream.body.$.prompt_cache_key | 34: ai21, aion-labs, akashml, alibaba-cloud, ambient, avian, … |  | sim-pck-7a3 |  | spec specs/ai21.json properties.prompt_cache_key | request-unsupported-forwarded |
| invented | executor | responses | responses.param.tools | upstream.body.$.tools.0.function.name | 34: aion-labs, alibaba-cloud, arcee-ai, avian, canopy-wave, cerebras, … |  | sim_tool_weather |  | spec specs/aion-labs.json properties.tools.items | request-unsupported-forwarded |
| invented | executor | responses | responses.param.service_tier | upstream.body.$.service_tier | 34: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | flex |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | responses | responses.param.service_tier=standard | upstream.body.$.service_tier | 34: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | standard |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | responses | responses.param.service_tier=default | upstream.body.$.service_tier | 34: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | standard |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | responses | responses.param.service_tier=fast | upstream.body.$.service_tier | 34: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | fast |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | responses | responses.param.service_tier=ultrafast | upstream.body.$.service_tier | 34: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | ultrafast |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | responses | responses.param.service_tier=priority | upstream.body.$.service_tier | 34: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | priority |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | responses | responses.param.service_tier=batch | upstream.body.$.service_tier | 34: ai21, aion-labs, alibaba-cloud, ambient, arcee-ai, avian, … |  | batch |  | spec specs/ai21.json properties.service_tier | request-unsupported-forwarded |
| invented | executor | messages | messages.param.metadata | upstream.body.$.metadata.user_id | 34: ai21, aion-labs, alibaba-cloud, avian, canopy-wave, chutes, … |  | client value |  | spec specs/ai21.json properties.user | request-unsupported-forwarded |
| invented | executor | messages | messages.param.stop_sequences | upstream.body.$.stop | 33: ambient, avian, byteplus, canopy-wave, chutes, clarifai, … |  | ["SIM-STOP-1","SIM-STOP-2"] |  | spec specs/ambient.json properties.stop | request-unsupported-forwarded |
| invented | executor | chat | chat.param.top_logprobs | upstream.body.$.top_logprobs | 32: ai21, aion-labs, avian, baidu, canopy-wave, chutes, … |  | 3 |  | spec specs/ai21.json properties.top_logprobs | request-unsupported-forwarded |
| wrong_value | executor | messages | messages.param.service_tier=ultrafast | upstream.body.$.service_tier | 32: alibaba, atlascloud, bytedance-seed, cerebras, cloudflare, deepinfra, … | one of ["auto","default","flex","scale","priority" | ultrafast |  | assumed: no alibaba spec; OpenAI schema (openai) used as a stand-in at | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.frequency_penalty | upstream.body.$.frequency_penalty | 32: ai21, aion-labs, alibaba-cloud, ambient, avian, byteplus, … |  | 0.11 |  | spec specs/ai21.json properties.frequency_penalty | request-unsupported-forwarded |
| invented | executor | chat | chat.param.presence_penalty | upstream.body.$.presence_penalty | 32: ai21, aion-labs, ambient, avian, byteplus, canopy-wave, … |  | 0.13 |  | spec specs/ai21.json properties.presence_penalty | request-unsupported-forwarded |
| invented | executor | chat | chat.param.stop | upstream.body.$.stop | 31: ambient, avian, byteplus, canopy-wave, chutes, clarifai, … |  | ["SIM-STOP-1","SIM-STOP-2"] |  | spec specs/ambient.json properties.stop | request-unsupported-forwarded |
| invented | executor | responses | responses.param.top_logprobs | upstream.body.$.top_logprobs | 31: ai21, aion-labs, avian, canopy-wave, chutes, crusoe, … |  | 3 |  | spec specs/ai21.json properties.top_logprobs | request-unsupported-forwarded |
| wrong_value | executor | responses | responses.param.service_tier=ultrafast | upstream.body.$.service_tier | 31: alibaba, atlascloud, bytedance-seed, cerebras, cloudflare, deepinfra, … | one of ["auto","default","flex","scale","priority" | ultrafast |  | assumed: no alibaba spec; OpenAI schema (openai) used as a stand-in at | request-params-dropped-or-changed |
| dropped | executor | messages | messages.param.thinking | upstream.body.$.reasoning_effort | 29: aion-labs, akashml, alibaba, arcee-ai, atlascloud, azure, … | present |  |  | https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.parallel_tool_calls | upstream.body.$.parallel_tool_calls | 28: aion-labs, avian, canopy-wave, chutes, crusoe, deepinfra, … |  | false |  | spec specs/aion-labs.json properties.parallel_tool_calls | request-unsupported-forwarded |
| invented | executor | responses | responses.param.parallel_tool_calls | upstream.body.$.parallel_tool_calls | 28: aion-labs, avian, canopy-wave, chutes, crusoe, deepinfra, … |  | false |  | spec specs/aion-labs.json properties.parallel_tool_calls | request-unsupported-forwarded |
| dropped | executor | responses | responses.param.store | upstream.body.$.store | 28: alibaba, atlascloud, bytedance-seed, cloudflare, google-vertex, groq, … | true |  |  | assumed: Phaseo does not document store; OpenAI-dialect providers that | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.reasoning_effort=none | upstream.body.$.reasoning_effort | 26: aion-labs, alibaba-cloud, alibaba, amazon-bedrock, atlascloud, azure, … | none |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.stream_options | upstream.body.$.stream_options.include_usage | 24: ai21, avian, canopy-wave, chutes, crusoe, featherless, … |  | true |  | spec specs/ai21.json properties.stream_options | request-unsupported-forwarded |
| invented | executor | chat | chat.base | upstream.body.$.stream_options | 24: avian, canopy-wave, chutes, crusoe, featherless, fireworks, … |  | {"include_usage":true} |  | assumed: Phaseo streams every text request upstream and buffers on its | request-invented-defaults |
| invented | executor | responses | responses.base | upstream.body.$.stream_options | 24: avian, canopy-wave, chutes, crusoe, featherless, fireworks, … |  | {"include_usage":true} |  | assumed: Phaseo streams every text request upstream and buffers on its | request-invented-defaults |
| invented | executor | messages | messages.base | upstream.body.$.stream_options | 24: avian, canopy-wave, chutes, crusoe, featherless, fireworks, … |  | {"include_usage":true} |  | assumed: Phaseo streams every text request upstream and buffers on its | request-invented-defaults |
| dropped | executor | chat/stream | resp:max | client.citations | 24: amazon-bedrock, ambient, anthropic-aws-us, anthropic-aws, anthropic-us, … | https://sim.example/cite-0001 |  |  | https://platform.openai.com/docs/api-reference/chat/object | stream-citations-refusal |
| dropped | executor | chat | chat.param.reasoning_effort=minimal | upstream.body.$.reasoning_effort | 24: aion-labs, alibaba, amazon-bedrock, atlascloud, azure, baidu, … | minimal |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| wrong_value | executor | chat/buffered | resp:finish:content_filter | client.finish | 24: amazon-bedrock, ambient, anthropic-aws-us, anthropic-aws, anthropic-us, … | ["content_filter"] | stop |  | https://platform.openai.com/docs/api-reference/chat/object | stream-finish-mapping |
| invented | executor | responses | responses.param.stream_options | upstream.body.$.stream_options.include_usage | 23: avian, canopy-wave, chutes, crusoe, featherless, fireworks, … |  | true |  | spec specs/avian.json properties.stream_options | request-unsupported-forwarded |
| dropped | executor | chat | chat.param.reasoning_effort | upstream.body.$.reasoning_effort | 23: aion-labs, alibaba, amazon-bedrock, atlascloud, azure, bytedance-seed, … | high |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.reasoning_effort=low | upstream.body.$.reasoning_effort | 23: aion-labs, alibaba, amazon-bedrock, atlascloud, azure, bytedance-seed, … | low |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.reasoning_effort=medium | upstream.body.$.reasoning_effort | 23: aion-labs, alibaba, amazon-bedrock, atlascloud, azure, bytedance-seed, … | medium |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.reasoning_effort=xhigh | upstream.body.$.reasoning_effort | 23: aion-labs, alibaba, amazon-bedrock, atlascloud, azure, bytedance-seed, … | xhigh |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat/buffered | resp:max | client.usage.prompt_tokens_details.cached_tokens | 23: amazon-bedrock, ambient, anthropic-aws-us, anthropic-aws, anthropic-us, … | 20011 |  |  | apps/docs/v1/guides/prompt-caching.mdx | billing-chat-cached-reads |
| dropped | executor | chat | chat.param.reasoning_effort=max | upstream.body.$.reasoning_effort | 22: aion-labs, alibaba, amazon-bedrock, atlascloud, bytedance-seed, empiri, … | max |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.reasoning | upstream.body.$.reasoning_effort | 22: aion-labs, alibaba, amazon-bedrock, atlascloud, azure, bytedance-seed, … | high |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | pricing | text.generate | catalogue:cache-read-missing | catalogue.cached_read_text_tokens | 21: akashml, alibaba-cloud, amazon-bedrock, azure, baidu, byteplus, … | a cache-read price | null |  | spec akashml usage schema | catalogue-data-rows |
| dropped | executor | responses | responses.param.reasoning | upstream.body.$.reasoning_effort | 19: aion-labs, alibaba, atlascloud, bytedance-seed, inflection, ionrouter-, … | high |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.tool_choice | upstream.body.$.tool_choice | 16: aion-labs, avian, chutes, crusoe, featherless, gmicloud, … |  | required |  | spec specs/aion-labs.json properties.tool_choice | request-unsupported-forwarded |
| invented | executor | responses | responses.param.tool_choice | upstream.body.$.tool_choice | 16: aion-labs, avian, chutes, crusoe, featherless, gmicloud, … |  | required |  | spec specs/aion-labs.json properties.tool_choice | request-unsupported-forwarded |
| invented | executor | messages | messages.param.tool_choice | upstream.body.$.tool_choice | 16: aion-labs, avian, chutes, crusoe, featherless, gmicloud, … |  | required |  | spec specs/aion-labs.json properties.tool_choice | request-unsupported-forwarded |
| dropped | executor | chat/stream | resp:finish:length | client.finish | 16: ambient, byteplus, clarifai, darkbloom, deepseek, doubleword, … | ["length"] | null |  | https://platform.openai.com/docs/api-reference/chat/object | billing-truncated-unbilled |
| wrong_value | executor | chat/buffered | resp:finish:length | client.finish | 16: ambient, byteplus, clarifai, darkbloom, deepseek, doubleword, … | ["length"] | stop |  | https://platform.openai.com/docs/api-reference/chat/object | stream-finish-mapping |
| dropped | executor | chat/stream | resp:finish:content_filter | client.finish | 16: ambient, byteplus, clarifai, darkbloom, deepseek, doubleword, … | ["content_filter"] | null |  | https://platform.openai.com/docs/api-reference/chat/object | billing-truncated-unbilled |
| dropped | executor | responses | responses.param.prompt | upstream.body.$.prompt.id | 15: amazon-bedrock, azure, baidu, byteplus, clarifai, darkbloom, … | pmpt_sim_0001 |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| wrong_value | executor | chat | chat.param.reasoning_effort=max | upstream.body.$.reasoning_effort | 14: akashml, alibaba-cloud, arcee-ai, cohere, friendli, mistral-eu, … | max | high |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.response_format | upstream.body.$.response_format.type | 13: aion-labs, avian, canopy-wave, chutes, crusoe, featherless, … |  | json_schema |  | spec specs/aion-labs.json properties.response_format | request-unsupported-forwarded |
| invented | executor | responses | responses.param.text | upstream.body.$.response_format.type | 13: aion-labs, avian, canopy-wave, chutes, crusoe, featherless, … |  | json_schema |  | spec specs/aion-labs.json properties.response_format | request-unsupported-forwarded |
| invented | executor | chat | chat.format.json_object | upstream.body.$.response_format.type | 13: aion-labs, avian, canopy-wave, chutes, crusoe, featherless, … |  | json_object |  | spec specs/aion-labs.json properties.response_format | request-unsupported-forwarded |
| invented | executor | responses | responses.format.json_object | upstream.body.$.response_format.type | 13: aion-labs, avian, canopy-wave, chutes, crusoe, featherless, … |  | json_object |  | spec specs/aion-labs.json properties.response_format | request-unsupported-forwarded |
| wrong_value | executor | chat | chat.param.reasoning_effort=minimal | upstream.body.$.reasoning_effort | 12: akashml, alibaba-cloud, cohere, fireworks, friendli, mistral, … | minimal | low |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | messages/buffered | resp:max | client.usage.cache_creation_input_tokens | 12: alibaba-cloud, amazon-bedrock, anthropic-aws-us, anthropic-aws, anthro, … | 3019 | null |  | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| wrong_value | executor | chat | chat.param.reasoning_effort=xhigh | upstream.body.$.reasoning_effort | 12: akashml, arcee-ai, baidu, cohere, friendli, mistral, … | xhigh | high |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| billing_under | executor | chat/stream | resp:finish:length | billing.uncachedInput | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":100003,"nanos":69002070,"meter":"input_t | {"tokens":0,"nanos":0} | -2305819173 | apps/docs/v1/guides/prompt-caching.mdx | billing-chat-cached-reads |
| billing_under | executor | chat/stream | resp:finish:length | billing.output | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":5003,"nanos":17460470,"meter":"output_te | {"tokens":0,"nanos":0} | -548316293 | apps/docs/v1/guides/prompt-caching.mdx | billing-truncated-unbilled |
| billing_under | executor | chat/buffered | resp:finish:length | billing.uncachedInput | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":100003,"nanos":69002070,"meter":"input_t | {"tokens":0,"nanos":0} | -2305819173 | apps/docs/v1/guides/prompt-caching.mdx | billing-chat-cached-reads |
| billing_under | executor | chat/buffered | resp:finish:length | billing.output | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":5003,"nanos":17460470,"meter":"output_te | {"tokens":0,"nanos":0} | -548316293 | apps/docs/v1/guides/prompt-caching.mdx | billing-truncated-unbilled |
| billing_under | executor | chat/stream | resp:finish:content_filter | billing.uncachedInput | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":100003,"nanos":69002070,"meter":"input_t | {"tokens":0,"nanos":0} | -2305819173 | apps/docs/v1/guides/prompt-caching.mdx | billing-chat-cached-reads |
| billing_under | executor | chat/stream | resp:finish:content_filter | billing.output | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":5003,"nanos":17460470,"meter":"output_te | {"tokens":0,"nanos":0} | -548316293 | apps/docs/v1/guides/prompt-caching.mdx | billing-truncated-unbilled |
| billing_under | executor | chat/buffered | resp:finish:content_filter | billing.uncachedInput | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":100003,"nanos":69002070,"meter":"input_t | {"tokens":0,"nanos":0} | -2305819173 | apps/docs/v1/guides/prompt-caching.mdx | billing-chat-cached-reads |
| billing_under | executor | chat/buffered | resp:finish:content_filter | billing.output | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":5003,"nanos":17460470,"meter":"output_te | {"tokens":0,"nanos":0} | -548316293 | apps/docs/v1/guides/prompt-caching.mdx | billing-truncated-unbilled |
| billing_under | executor | messages/stream | resp:finish:length | billing.uncachedInput | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":100003,"nanos":69002070,"meter":"input_t | {"tokens":0,"nanos":0} | -2305819173 | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| billing_under | executor | messages/stream | resp:finish:length | billing.output | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":5003,"nanos":17460470,"meter":"output_te | {"tokens":0,"nanos":0} | -548316293 | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| billing_under | executor | messages/buffered | resp:finish:length | billing.uncachedInput | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":100003,"nanos":69002070,"meter":"input_t | {"tokens":0,"nanos":0} | -2305819173 | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| billing_under | executor | messages/buffered | resp:finish:length | billing.output | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":5003,"nanos":17460470,"meter":"output_te | {"tokens":0,"nanos":0} | -548316293 | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| billing_under | executor | messages/stream | resp:finish:content_filter | billing.uncachedInput | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":100003,"nanos":69002070,"meter":"input_t | {"tokens":0,"nanos":0} | -2305819173 | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| billing_under | executor | messages/stream | resp:finish:content_filter | billing.output | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":5003,"nanos":17460470,"meter":"output_te | {"tokens":0,"nanos":0} | -548316293 | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| billing_under | executor | messages/buffered | resp:finish:content_filter | billing.uncachedInput | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":100003,"nanos":69002070,"meter":"input_t | {"tokens":0,"nanos":0} | -2305819173 | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| billing_under | executor | messages/buffered | resp:finish:content_filter | billing.output | 11: ambient, byteplus, deepseek, groq, meta, ovhcloud, … | {"tokens":5003,"nanos":17460470,"meter":"output_te | {"tokens":0,"nanos":0} | -548316293 | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| dropped | executor | responses | responses.param.reasoning | upstream.body.$.reasoning.effort | 11: amazon-bedrock, ambient, byteplus, clarifai, darkbloom, deepseek, … | high |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| wrong_value | executor | chat | chat.base | upstream.url | 11: alibaba-cloud, arcee-ai, deepinfra, inflection, longcat, mistral-eu, … | ^https://[^/]+\.ap-southeast-1\.maas\.aliyuncs\.co | https://dashscope-intl.aliyuncs.com/compatible-mod |  | https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai- | request-url-and-dialect |
| wrong_value | executor | responses | responses.base | upstream.url | 11: alibaba-cloud, arcee-ai, deepinfra, inflection, longcat, mistral-eu, … | ^https://[^/]+\.ap-southeast-1\.maas\.aliyuncs\.co | https://dashscope-intl.aliyuncs.com/compatible-mod |  | https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai- | request-url-and-dialect |
| wrong_value | executor | messages | messages.base | upstream.url | 11: alibaba-cloud, arcee-ai, deepinfra, inflection, longcat, mistral-eu, … | ^https://[^/]+\.ap-southeast-1\.maas\.aliyuncs\.co | https://dashscope-intl.aliyuncs.com/compatible-mod |  | https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai- | request-url-and-dialect |
| dropped | executor | messages/buffered | resp:max | client.reasoning.state | 11: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | signature / encrypted reasoning |  |  | https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking | reasoning-roundtrip |
| dropped | executor | messages | messages.param.thinking | upstream.body.$.reasoning.effort | 10: ambient, byteplus, clarifai, darkbloom, deepseek, meta, … | present |  |  | https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking | request-params-dropped-or-changed |
| invented | executor | chat | chat.param.top_p | upstream.body.$.top_p | 10: aion-labs, avian, canopy-wave, chutes, crusoe, inception, … |  | 0.91 |  | spec specs/aion-labs.json properties.top_p | request-unsupported-forwarded |
| invented | executor | responses | responses.param.top_p | upstream.body.$.top_p | 10: aion-labs, avian, canopy-wave, chutes, crusoe, inception, … |  | 0.91 |  | spec specs/aion-labs.json properties.top_p | request-unsupported-forwarded |
| invented | executor | messages | messages.param.top_p | upstream.body.$.top_p | 10: aion-labs, avian, canopy-wave, chutes, crusoe, inception, … |  | 0.91 |  | spec specs/aion-labs.json properties.top_p | request-unsupported-forwarded |
| dropped | executor | chat | chat.param.reasoning | upstream.body.$.reasoning.effort | 9: ambient, byteplus, clarifai, darkbloom, deepseek, meta, … | high |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.reasoning_effort | upstream.body.$.reasoning.effort | 9: ambient, byteplus, clarifai, darkbloom, deepseek, meta, … | high |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.reasoning_effort=low | upstream.body.$.reasoning.effort | 9: ambient, byteplus, clarifai, darkbloom, deepseek, meta, … | low |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.reasoning_effort=medium | upstream.body.$.reasoning.effort | 9: ambient, byteplus, clarifai, darkbloom, deepseek, meta, … | medium |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat/buffered | resp:max | client.reasoning.state | 9: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | signature / encrypted reasoning |  |  | apps/docs/v1/api-reference/endpoint/chat-completions.mdx | reasoning-roundtrip |
| dropped | executor | chat | chat.param.stream_options | upstream.body.$.stream_options.include_obfuscation | 9: ambient, byteplus, clarifai, darkbloom, deepseek, doubleword, … | false |  |  | https://platform.openai.com/docs/api-reference/chat-streaming | request-params-dropped-or-changed |
| wrong_value | pricing | text.generate | catalogue:cache-read-not-discounted.stan | catalogue.cached_read_text_tokens.price_per_unit | 8: atlascloud, baseten, cerebras, openai, ovhcloud, parasail, … | < input price | {"cacheRead":"0.55","input":"0.55","unit_size":100 |  | assumed: Provider pricing page not checked; a cache hit that costs not | catalogue-data-rows |
| wrong_type | executor | chat | chat.content.second-system | upstream.body(client $.messages[].content) | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | structured value | embedded in a JSON string |  | assumed: Every value the client sends in content, tools or history mus | request-content-values |
| dropped | executor | chat | chat.param.reasoning_effort=none | upstream.body.$.reasoning.effort | 8: ambient, byteplus, clarifai, darkbloom, deepseek, meta, … | none |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.reasoning_effort=minimal | upstream.body.$.reasoning.effort | 8: ambient, byteplus, clarifai, darkbloom, deepseek, meta, … | minimal |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.reasoning_effort=xhigh | upstream.body.$.reasoning.effort | 8: ambient, byteplus, clarifai, darkbloom, deepseek, meta, … | xhigh |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.reasoning_effort=max | upstream.body.$.reasoning.effort | 8: ambient, byteplus, clarifai, darkbloom, deepseek, meta, … | max |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| wrong_value | executor | chat | chat.param.reasoning_effort=none | upstream.body.$.reasoning_effort | 8: akashml, arcee-ai, cohere, friendli, moonshotai-turbo, stepfun, … | none | low |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| billing_over | executor | responses/buffered | resp:max | billing.uncachedInput | 8: alibaba-cloud, amazon-bedrock, anthropic-aws-us, anthropic-aws, anthro, … | {"tokens":76973,"nanos":153946000,"meter":"input_t | {"tokens":79992,"nanos":159984000} | 119152382 | apps/docs/v1/guides/prompt-caching.mdx | billing-responses-claude-cache |
| dropped | executor | chat/stream | resp:finish:refusal | client.refusal | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | SIM-UPSTREAM-REFUSAL-0001 cannot help with that |  |  | https://platform.openai.com/docs/api-reference/chat/object | stream-citations-refusal |
| wrong_value | executor | messages/stream | resp:finish:content_filter | client.finish | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | ["refusal"] | end_turn |  | https://docs.anthropic.com/en/api/messages | stream-finish-mapping |
| invented | executor | chat | chat.base | upstream.body.$.thinking | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … |  | {"type":"adaptive","display":"summarized"} |  | assumed: Phaseo streams every text request upstream and buffers on its | request-invented-defaults |
| dropped | executor | chat | chat.param.temperature | upstream.body.$.temperature | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 0.37 |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.top_p | upstream.body.$.top_p | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 0.91 |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | chat | chat.param.top_k | upstream.body.$.top_k | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 41 |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| invented | executor | responses | responses.base | upstream.body.$.thinking | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … |  | {"type":"adaptive","display":"summarized"} |  | assumed: Phaseo streams every text request upstream and buffers on its | request-invented-defaults |
| dropped | executor | responses | responses.param.temperature | upstream.body.$.temperature | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 0.37 |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | responses | responses.param.top_p | upstream.body.$.top_p | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 0.91 |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | responses | responses.param.top_k | upstream.body.$.top_k | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 41 |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| invented | executor | messages | messages.base | upstream.body.$.thinking | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … |  | {"type":"adaptive","display":"summarized"} |  | assumed: Phaseo streams every text request upstream and buffers on its | request-invented-defaults |
| dropped | executor | messages | messages.param.temperature | upstream.body.$.temperature | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 0.37 |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | messages | messages.param.top_p | upstream.body.$.top_p | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 0.91 |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | messages | messages.param.top_k | upstream.body.$.top_k | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 41 |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| wrong_value | executor | chat/stream | resp:finish:content_filter | client.finish | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | ["content_filter"] | stop |  | https://platform.openai.com/docs/api-reference/chat/object | stream-finish-mapping |
| wrong_value | executor | responses/stream | resp:finish:content_filter | client.finish | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | ["incomplete:content_filter"] | completed |  | https://platform.openai.com/docs/api-reference/responses/object | stream-finish-mapping |
| wrong_value | executor | responses/buffered | resp:finish:content_filter | client.finish | 8: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | ["incomplete:content_filter"] | completed |  | https://platform.openai.com/docs/api-reference/responses/object | stream-finish-mapping |
| wrong_value | executor | chat | chat.param.reasoning_effort=instant | upstream.body.$.reasoning_effort | 7: akashml, arcee-ai, cohere, fireworks, friendli, stepfun, … | instant | low |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| billing_under | executor | chat/buffered | resp:max | billing.read | 7: akashml, amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, … | {"tokens":20011,"nanos":2801540,"meter":"cached_re | {"tokens":20011,"nanos":1000550} | -55765654 | apps/docs/v1/guides/prompt-caching.mdx | billing-chat-cached-reads |
| error_mapping | executor | chat/stream | resp:error:mid-stream | client.error | 7: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | error event or error status | no error surfaced |  | apps/docs/v1/guides/streaming.mdx | stream-midstream-errors |
| dropped | executor | messages/buffered | resp:max | client.reasoning.redacted_thinking | 7: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | SIM-UPSTREAM-REDACTED-0001 |  |  | https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking | reasoning-roundtrip |
| dropped | executor | messages/buffered | resp:max | client.usage.cache_creation.ephemeral_5m_input_tokens | 7: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 1013 |  |  | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| dropped | executor | messages/buffered | resp:max | client.usage.cache_creation.ephemeral_1h_input_tokens | 7: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 2006 |  |  | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| dropped | executor | messages/buffered | roundtrip:messages | roundtrip.upstream.thinking_signature | 7: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | SIM-UPSTREAM-SIGNATURE-0001 |  |  | https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking | reasoning-roundtrip |
| dropped | executor | messages/buffered | roundtrip:messages | roundtrip.upstream.redacted_thinking | 7: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | SIM-UPSTREAM-REDACTED-0001 |  |  | https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking | reasoning-roundtrip |
| wrong_value | executor | responses | responses.base | upstream.dialect | 7: baidu, byteplus, darkbloom, deepseek, doubleword, sakana, … | ["openai-chat"] | openai-responses |  | https://cloud.baidu.com/doc/qianfan-api/s/3m7of64lb | request-url-and-dialect |
| dropped | executor | chat | chat.param.parallel_tool_calls | upstream.body.$.tool_choice.disable_parallel_tool_use | 7: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | true |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | responses | responses.param.parallel_tool_calls | upstream.body.$.tool_choice.disable_parallel_tool_use | 7: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | true |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | messages | messages.param.thinking | upstream.body.$.thinking.budget_tokens | 7: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | 2048 |  |  | https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking | request-params-dropped-or-changed |
| dropped | executor | chat/buffered | roundtrip:chat | roundtrip.upstream.thinking_signature | 7: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | SIM-UPSTREAM-SIGNATURE-0001 |  |  | apps/docs/v1/api-reference/endpoint/chat-completions.mdx | reasoning-roundtrip |
| dropped | executor | chat/buffered | roundtrip:chat | roundtrip.upstream.redacted_thinking | 7: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop, … | SIM-UPSTREAM-REDACTED-0001 |  |  | apps/docs/v1/api-reference/endpoint/chat-completions.mdx | reasoning-roundtrip |
| invented | executor | responses | responses.param.stream_options | upstream.body.$.stream_options.include_obfuscation | 6: groq, ovhcloud, sail-research, sambanova, spacex-ai, venice |  | false |  | spec specs/groq.json properties.stream_options | request-unsupported-forwarded |
| dropped | executor | responses/buffered | resp:max | client.tool_call.id | 6: google-vertex-eu, google-vertex, minimax-lightning, minimax, z-ai, zai | call_SIM_UP_0001 |  |  | https://platform.openai.com/docs/api-reference/chat/object | stream-tool-ids |
| wrong_value | executor | chat/buffered | resp:max | client.usage.prompt_tokens | 6: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop | 123033 | 126052 |  | apps/docs/v1/guides/prompt-caching.mdx | billing-chat-cached-reads |
| billing_over | executor | chat/buffered | resp:max | billing.uncachedInput | 6: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop | {"tokens":100003,"nanos":200006000,"meter":"input_ | {"tokens":123033,"nanos":246066000} | 793786525 | apps/docs/v1/guides/prompt-caching.mdx | billing-chat-cached-reads |
| billing_under | executor | messages/buffered | resp:max | billing.write5m | 6: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop | {"tokens":1013,"nanos":2532500,"meter":"cached_wri | {"tokens":0,"nanos":0} | -36052670 | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| billing_under | executor | messages/buffered | resp:max | billing.write1h | 6: amazon-bedrock, anthropic-aws-us, anthropic-aws, anthropic-us, anthrop | {"tokens":2006,"nanos":8024000,"meter":"cached_wri | {"tokens":0,"nanos":0} | -114121340 | apps/docs/v1/guides/prompt-caching.mdx | billing-messages-usage |
| wrong_value | executor | chat | chat.base | upstream.dialect | 6: byteplus, darkbloom, deepseek, doubleword, sakana, xiaomi | ["openai-chat"] | openai-responses |  | https://docs.byteplus.com/en/docs/ModelArk/1494384 | request-url-and-dialect |
| wrong_value | executor | messages | messages.base | upstream.dialect | 6: byteplus, darkbloom, deepseek, doubleword, sakana, xiaomi | ["openai-chat"] | openai-responses |  | https://docs.byteplus.com/en/docs/ModelArk/1494384 | request-url-and-dialect |
| dropped | executor | chat | chat.param.reasoning_effort=instant | upstream.body.$.reasoning_effort | 6: aion-labs, alibaba-cloud, baidu, minimax-lightning, minimax, wafer | instant |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | responses/buffered | roundtrip:responses | roundtrip.upstream.assistant_tool_call | 6: google-vertex-eu, google-vertex, minimax-lightning, minimax, z-ai, zai | SIM-UP-ARG-Lyon |  |  | https://ai.google.dev/gemini-api/docs/function-calling | reasoning-roundtrip |
| error_mapping | executor | chat | chat.agent10.step10 | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | responses | responses.agent10.step10 | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | messages | messages.agent10.step10 | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| wrong_value | executor | chat | chat.param.service_tier=fast | upstream.body.$.service_tier | 5: cerebras, deepinfra, fireworks, groq, nebius-token-factory | one of ["auto","default","flex","priority"] or rem | fast |  | spec specs/cerebras.json properties.service_tier | request-params-dropped-or-changed |
| wrong_value | executor | responses | responses.param.service_tier=fast | upstream.body.$.service_tier | 5: cerebras, deepinfra, fireworks, groq, nebius-token-factory | one of ["auto","default","flex","priority"] or rem | fast |  | spec specs/cerebras.json properties.service_tier | request-params-dropped-or-changed |
| wrong_value | executor | messages | messages.param.service_tier=fast | upstream.body.$.service_tier | 5: cerebras, deepinfra, fireworks, groq, nebius-token-factory | one of ["auto","default","flex","priority"] or rem | fast |  | spec specs/cerebras.json properties.service_tier | request-params-dropped-or-changed |
| dropped | executor | responses | responses.param.text | upstream.body.$.text.format.type | 5: ambient, baidu, groq, sambanova, scaleway | json_schema |  |  | apps/docs/v1/api-reference/parameters.mdx | request-params-dropped-or-changed |
| dropped | executor | responses/buffered | resp:max | client.usage.input_tokens_details.cache_write_tokens | 5: alibaba-cloud, moonshotai, openai-eu, openai, venice | 3019 |  |  | apps/docs/v1/guides/prompt-caching.mdx | billing-responses-claude-cache |
| error_mapping | executor | chat | chat.param.response_format | client.status | 5: hyperbolic, infermatic, longcat, switchpoint, thinking-machines | 200 | 400 |  | apps/docs/v1/api-reference/parameters.mdx | request-other-rejections |
| error_mapping | executor | responses | responses.param.text | client.status | 5: hyperbolic, infermatic, longcat, switchpoint, thinking-machines | 200 | 400 |  | apps/docs/v1/api-reference/parameters.mdx | request-other-rejections |
| error_mapping | executor | chat | chat.format.json_object | client.status | 5: hyperbolic, infermatic, longcat, switchpoint, thinking-machines | 200 | 400 |  | apps/docs/v1/api-reference/parameters.mdx | request-other-rejections |
| error_mapping | executor | responses | responses.format.json_object | client.status | 5: hyperbolic, infermatic, longcat, switchpoint, thinking-machines | 200 | 400 |  | apps/docs/v1/api-reference/parameters.mdx | request-other-rejections |
| error_mapping | executor | chat | chat.base | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.reasoning | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.reasoning_effort | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.reasoning_effort=none | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.reasoning_effort=instant | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.reasoning_effort=minimal | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.reasoning_effort=low | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.reasoning_effort=medium | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.reasoning_effort=xhigh | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.reasoning_effort=max | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.frequency_penalty | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.logit_bias | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.max_completion_tokens | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.max_tokens | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.metadata | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.session_id | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.presence_penalty | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.seed | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.store | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.stream_options | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.temperature | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.tools | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.max_tool_calls | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.parallel_tool_calls | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.tool_choice | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.logprobs | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.top_logprobs | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.top_p | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.stop | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |
| error_mapping | executor | chat | chat.param.response_format | upstream.call | 5: liquid-ai, liquid, private-model, scaledown, venice-e2ee | an upstream request | liquid-ai_base_url_missing: liquid-ai_base_url_mis |  | assumed: A valid request routed to an active provider must reach that  | harness-unroutable-providers |

… 819 more groups in results/gate.json.

## Allow-list use

- `request-content-values`: 6237
- `request-unsupported-forwarded`: 4353
- `request-params-dropped-or-changed`: 2108
- `stream-grammar`: 2010
- `harness-unroutable-providers`: 1463
- `stream-citations-refusal`: 1450
- `stream-midstream-errors`: 1397
- `stream-finish-mapping`: 1324
- `request-messages-params`: 830
- `request-invented-defaults`: 720
- `request-rejected-sdk-shapes`: 486
- `billing-messages-usage`: 434
- `catalogue-data-rows`: 282
- `billing-usage-reasoning-field`: 187
- `reasoning-roundtrip`: 167
- `request-previous-response-id`: 162
- `billing-chat-cached-reads`: 144
- `billing-truncated-unbilled`: 128
- `billing-gemini-thinking`: 123
- `request-executor-local-errors`: 107
- `request-url-and-dialect`: 75
- `billing-pricing-engine`: 70
- `request-other-rejections`: 39
- `billing-responses-claude-cache`: 29
- `stream-tool-ids`: 28
- `by-design-openai-request-id`: 16
- `request-executor-explicit-rejections`: 15
- `billing-fast-plan`: 15
- `routing-zero-max-output`: 14
- `billing-meter-label`: 12
- `routing-429-as-502`: 10
- `billing-pricing-throws`: 10
- `billing-stt-estimates`: 8
- `billing-e2e-messages-usage`: 6
- `billing-anthropic-web-search`: 6
- `routing-nontext-misc`: 6
- `billing-alibaba-double-read`: 5
- `billing-tts-unbilled`: 5
- `routing-model-fallback`: 4
- `billing-e2e-chat-cached-reads`: 3
- `routing-presets`: 3
- `by-design-google-cached-content-byok`: 2
- `stream-midstream-e2e`: 1
