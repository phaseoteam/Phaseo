---
"@phaseo/web-api": patch
---

Keep the models table loading when its cache misses. Rolling seven-day usage for monitor rows now comes from a snapshot refreshed every 15 minutes, not a raw request scan on each read. Route flag lookups for those rows run concurrently.
