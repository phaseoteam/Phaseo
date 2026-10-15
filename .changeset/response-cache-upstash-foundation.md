---
"@phaseo/gateway-api": minor
---

Add opt-in response caching backed by Upstash Redis. Caching is off unless the `X-Phaseo-Cache: true` request header or the preset turns it on; a preset that disables caching cannot be overridden. Entries are scoped to the API key, only successful responses are stored, and zero data retention workspaces are never cached. Hits are free, report zero usage, do not count toward the per-minute request limit, and return `X-Phaseo-Cache-Status`, `-Age`, `-TTL` and `-Source-Id` headers. `X-Phaseo-Cache-TTL` sets the TTL (1 to 86,400 seconds) and `X-Phaseo-Cache-Clear: true` replaces an entry.
