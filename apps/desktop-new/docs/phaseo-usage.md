# Desktop usage

The desktop Usage page shows Phaseo gateway charges alongside local CLI usage. Native session history stays on the machine and is never uploaded to Phaseo. Gateway totals read existing request logs for the connected desktop OAuth keys; no additional cloud tables or migration are needed.

Gateway charges are actual logged charges. Local costs remain API-equivalent estimates, not subscription payments. Missing usage and capped results are labeled partial. Gateway data is cached in memory for five minutes and stale data refreshes in the background. Removing or replacing an account excludes its cache from the view.

The private read-only `/desktop/usage` route must be released before gateway totals appear. It restricts metadata to the authenticated workspace and key, with bounded time windows and pagination. The previous native-history upload proposal is retired; its publisher is disconnected from backend startup.
