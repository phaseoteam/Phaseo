---
"@phaseo/gateway-api": patch
---

GPT Live sessions start again. Since OpenAI's GPT-5.6 prices began separating 30-minute and 12-hour prompt-cache writes, every GPT Live session was refused with `live_backend_price_card_missing`. Backend cache writes are now billed at OpenAI's 30-minute or 12-hour write price, following the split OpenAI reports.
