---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Refresh the website's catalogue data within about a minute of a catalogue change. A database revision that ignores no-op rewrites drives a web-api cron, which purges the Cloudflare catalogue cache and then expires the website's catalogue cache tags.
