---
"@phaseo/gateway-api": patch
---

Fix metering of Claude server-side web searches. `usage.server_tool_use.web_search_requests` from Anthropic, Bedrock and Vertex Claude now reaches the `native_web_search_requests` meter on streamed and buffered requests on Chat, Responses and Messages. Buffered IR usage also keeps `server_tool_use`, so it is reported in the response usage.
