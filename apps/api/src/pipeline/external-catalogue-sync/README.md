# External catalogue sync

Once a day (05:23 UTC, inside the every-minute cron), the gateway refreshes the routes of **external providers**: gateways and clouds that Phaseo lists on model pages but does not route to (`v2_providers.status = 'external'`).

For each provider in `EXTERNAL_CATALOGUE_SOURCES` it fetches the public `/models` list, parses limits and prices with the model-discovery pricing normalisers, and calls `sync_external_provider_catalogue`. The database function does the rest:

| What | Rule |
| --- | --- |
| Routes touched | Only that provider's routes with `routing_enabled = false`, matched on `provider_model_slug` (case-insensitive). |
| Context and output limits | Updated when the provider reports a positive value that differs. Output limits above the context window are ignored. |
| Removed models | A route missing from the list gets `metadata.external_sync.missing_since`; after 3 days it is marked `removed`. A route that comes back is set to `available` again. |
| Safety stop | If the list is empty or matches under 25% of the routes, nothing is marked missing or removed (usually an ID format or API change). |
| Prices | Input, output and cache read/write rates. A changed rate end-dates the current standard price and adds the next version of the same price code, carrying other meters over. A route with no price but an active `text.generate` capability gets an `external-sync` price. Routes with several or conditional prices are skipped. |
| New models | A listed ID with no route gets one (external, not routable, `global:standard` variant, `text.generate` capability for text-only models, then a price as above) when it names exactly one catalogue model: by model ID, by an enabled alias, by another provider's route with the same upstream ID, or by an organisation prefix this provider already uses for our models (`zai/` → `z-ai/`). Variant IDs (`:batch`, `:free`, `-batch`, `-fast`, …) and `~` aliases are skipped, a model never gets a second route on the same provider, and at most 200 routes are added per provider per run. New routes carry `metadata.external_sync_added.matched_by`. |
| Writes | Only when a value changes, so a quiet day writes nothing. |

Each run logs one `external_catalogue_sync` line per provider with counts (`matched`, `limits_updated`, `removed`, `prices_changed`, `unmatched`, …). Providers whose list needs an API key (Perplexity Agent, AnyAPI, Tencent Cloud, Mixlayer, evroc, CloudFerro Sherlock, STACKIT, RunInfra, HPC-AI) are not synced. Listed IDs that name no catalogue model, or more than one, are only counted (`unmatched`, with a sample) for a person to map.

The job runs only when `MODEL_DISCOVERY_ENABLED` is not `false`.
