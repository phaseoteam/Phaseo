---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Model pages publish performance, uptime, latency, speed and cache-rate stats at any volume when no location, stream or context filter is applied, so low-traffic hours and their errors now show. Filtered views keep the 20-request minimum. Uptime ignores errors the customer caused, the uptime tooltip shows how many requests failed, and the empty state says whether a period had no requests or a location had too little traffic to publish.
