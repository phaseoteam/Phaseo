---
"@phaseo/gateway-api": minor
"@phaseo/sdk": patch
"@phaseo/web": patch
"@phaseo/web-api": patch
---

`POST /v1/live/sessions` accepts GPT Live 1.1 (`openai/gpt-live-1.1`) as well as GPT Live 1, with or without the `openai/` prefix, and starts the session on the model you chose. GPT Live voice time is now priced from each model's published catalogue price ($0.05 per active minute, billed per second) instead of a fixed rate in the gateway, and standby time is billed at its own rate ($0.02 per minute) if OpenAI reports any. A Live model without a published price returns `live_price_card_missing` instead of starting. Sessions that were already running settle at the rate they started with. Model pages label GPT Live's rates "Active session" and "Standby session".
