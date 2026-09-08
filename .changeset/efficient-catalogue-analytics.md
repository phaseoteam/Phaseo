---
"@phaseo/web-api": patch
---

Use scalar catalogue and usage RPCs to avoid repeated database work and row-limit truncation. Fetch independent metrics and comparison periods concurrently, reuse standard-tier pricing from the complete payload, and skip unused health queries for filtered performance requests.

Allow stale catalogue responses during edge refresh and upstream errors without extending browser staleness or renewing the inner cache. Preserve user identity for spending and provider-onboarding RPCs, and correct the spending-unit conversion for contact personalization.
