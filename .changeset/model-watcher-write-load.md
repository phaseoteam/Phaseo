---
"@phaseo/gateway-api": patch
---

Cut the model watcher's database and upstream load: write seen-model rows only when they change (refreshing `last_seen_at` daily), check official pricing pages hourly and save them only when they change, and share one upstream request between provider entries with the same URL and key.
