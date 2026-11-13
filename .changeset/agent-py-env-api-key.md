---
"@phaseo/agent-sdk-py": patch
---

`create_gateway_agent_client()` now falls back to the `PHASEO_API_KEY` environment variable when `client_options` has no `api_key`, like the other SDKs.
