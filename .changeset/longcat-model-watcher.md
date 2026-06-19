---
"@ai-stats/gateway-api": patch
"@ai-stats/web": patch
---

Hook up the Meituan LongCat provider in scheduled model discovery and catalog data.

This adds LongCat to the API model watcher, accepts the existing `MEITUAN_API_KEY` env alias in the API layer, and adds LongCat provider mapping and pricing data for `meituan/longcat-2.0-preview`.
