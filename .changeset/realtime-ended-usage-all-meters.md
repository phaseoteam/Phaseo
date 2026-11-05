---
"@phaseo/gateway-api": patch
---

Realtime `session.ended` now lists every meter a settled call was billed on. GPT Live calls include their backend cache writes (`cached_write_text_tokens_30m` and `_12h`) and web searches (`native_web_search_requests`), and any call billed for cache writes reports them. Before, these were charged but left out of `usage`. When `billing_status` is `pending` or `unresolved`, `usage` is what was known when the event was sent, and `final_bill` returns the final meters.
