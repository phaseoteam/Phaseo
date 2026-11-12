---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
---

Tool-call and structured-output quality now count only replies the gateway actually checked. Failed requests no longer count as structured-output successes or as tool-call errors, and tool calls known only from usage are no longer assumed valid. Streamed Messages replies are rebuilt so their JSON output and tool calls can be checked, Messages `output_config.format` counts as a structured-output request, and Responses replies are checked against their answer text rather than their reasoning. Empty tool arguments read as an empty object, a schema pattern too risky to run no longer fails a call, and an hour with nothing to check shows no rate instead of 100%.
