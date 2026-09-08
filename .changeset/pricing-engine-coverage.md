---
"@phaseo/gateway-api": patch
"@phaseo/data-catalog": patch
"@phaseo/web": patch
---

Reject malformed pricing units, unsupported currencies, unsafe debit amounts and incomplete priced subtotals. Preserve reference-input charges for per-clip video pricing and correct stable Vertex Veo rates to bill output seconds.

Retire obsolete catalog-owned billing meters when a SKU's billing unit changes, preserving historical meter references and protected pricing overrides.

Preserve LTX audio-to-video billing during terminal status/content reads and exclude retired meters from public pricing projections.
