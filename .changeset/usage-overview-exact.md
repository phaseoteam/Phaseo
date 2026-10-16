---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Build the usage overview from exact totals summed in the database rather than a 5,000-request sample, so busy workspaces see every request in their KPI cards, charts, top lists, explore table and guardrail blocks. A new 15-minute workspace rollup, kept current by the analytics outbox, covers whole quarter hours. `get_private_usage_overview` adds the requests at the window's edges and buckets them in the reader's time zone. KPI forecasts now start from the card's exact figure, project at the last 7 days' pace under the same filters, and run to local period ends, so filtered views get forecasts too. Request labels get the same treatment: a per-label rollup backs label-filtered views, the label filter lists every label used in the range, and the logs page's label totals are exact. Cache hit rate now counts `cached_input_tokens`, which the overview previously missed.
