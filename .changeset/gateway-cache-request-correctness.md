---
"@phaseo/gateway-api": patch
---

Fix prompt-cache request correctness across providers: send every Bedrock Claude model to the Messages API, replay Gemini function calls with their responses, translate and cap cache breakpoints per provider, accept documented `cache_control` on Chat and Responses, send Anthropic only `metadata.user_id`, stop cache and identity hints from constraining routing, keep later system messages for Claude, and reject `previous_response_id` and `conversation` on `/v1/responses`.
