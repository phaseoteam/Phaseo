---
"@phaseo/gateway-api": patch
---

A streamed Chat Completions request is now billed with the last usage its stream reports. When content chunks already carried usage, the finish chunk used to settle billing with the usage seen so far, so a usage-only chunk after it (`choices: []`, as with `stream_options.include_usage`) and the later choices of an `n > 1` request were not counted. Usage now settles at the stream's `[DONE]`, or when the upstream closes, with the latest usage reported, 0 counts included. Messages and Responses streams are unchanged.
