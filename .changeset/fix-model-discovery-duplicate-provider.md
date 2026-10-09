---
"@phaseo/gateway-api": patch
---

Fix the model-discovery cron failing with "ON CONFLICT DO UPDATE command cannot affect row a second time". EmpirioLabs was listed twice in the discovery provider list, so one run upserted the same seen-model rows twice and aborted persistence for every provider. Discovery now lists each provider once, dedupes seen-model rows by provider and model before upserting and logs `model_discovery_duplicate_rows_dropped` with provider ids and a count if any duplicate is still dropped. The shared OpenAI-compatible executor's upstream error log line now includes the model and route.
