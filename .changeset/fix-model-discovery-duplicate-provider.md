---
"@phaseo/gateway-api": patch
---

Fix the model-discovery cron failing with "ON CONFLICT DO UPDATE command cannot affect row a second time". EmpirioLabs was listed twice in the discovery provider list, so one run upserted the same seen-model rows twice and aborted persistence for every provider. Discovery now lists each provider once, dedupes seen-model rows by provider and model before upserting, and the shared OpenAI-compatible executor includes the model and route in its upstream error log line.
