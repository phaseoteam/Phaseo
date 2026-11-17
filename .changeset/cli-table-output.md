---
"@phaseo/gateway-api": patch
---

The CLI prints lists as tables with headers: keys, workspaces, models, logs, activity, analytics, providers and every management list. Money uses US formatting, such as `$1,234.50`. In terminals that support clickable links, model IDs, providers and request IDs open their Phaseo pages; `phaseo logs get` prints the request's dashboard link.

`phaseo pricing models` shows input, output and cache-read prices per route, with the route's other charges, instead of a meter count. It takes `--model`, `--provider`, `--endpoint`, `--tier` and `--limit` filters. The new `phaseo pricing get <model>` lists every price with its conditions, such as prompt-size tiers and busy-hours prices. `phaseo analytics get` now passes `--limit` and `--offset` through.

`GET /v1/pricing/models` returns each entry's `service_tier`, so standard, flex and priority price lists for the same route can be told apart.
