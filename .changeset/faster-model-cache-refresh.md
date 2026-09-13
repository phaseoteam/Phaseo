---
"@phaseo/web": patch
"@phaseo/web-api": patch
"@phaseo/gateway-api": patch
---

Refresh public model caches after catalogue edits, shorten mutable Cloudflare freshness windows, recheck catalogue and model pages when a tab resumes, and stream model detail sections after the overview. Make gateway model responses immediately revalidate in client caches. The manual model purge now expires the entire model route, while search uses a short Cloudflare cache and refetches directly on return instead of requiring a browser generation counter.
