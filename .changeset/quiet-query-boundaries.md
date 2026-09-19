---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Migrate client data refresh to TanStack Query with account-scoped caches, credential-free public requests, and private-data invalidation on session changes. Reauthorize provider previews, preserve private model endpoint rows, and restore repeated focus refreshes without background polling.

Keep private query data fresh for five minutes, refresh visible private queries every five minutes, and invalidate account queries after private-model and provider-catalogue mutations. Manual refresh and sign-out bypass the freshness window.

Prevent old private content flashing after account changes by masking saved documents and revalidating full-document history restores before cached HTML can paint.

Use fifteen-minute public query freshness and visible polling for catalogue, pricing, performance and search views. Align public provider information, model/provider telemetry and pricing at the edge to fifteen minutes without an additional stale-serving window. Preserve five-minute private queries, explicit client invalidation/refetch, and server cache purge tags.
