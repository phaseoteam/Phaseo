---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Bound public catalogue requests and allow sitemap generation to fetch model metadata without gateway monitor enrichment, preventing stalled upstream requests from exhausting the prerender cache deadline.

Pass the locale direction to Base UI so Arabic ShadCN components use RTL interaction behavior.
