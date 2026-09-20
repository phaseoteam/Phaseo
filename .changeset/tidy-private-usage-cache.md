---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Cache private usage dashboards, geography, and log lists in user/workspace-scoped browser memory for five minutes. Keep Live views on fresh 15-second network polling, allow manual refresh to bypass freshness, and clear private query data on sign-out and identity changes.

Extend private caching to account/profile, workspace administration, keys, routing, guardrails, privacy, notifications, presets and feedback, private models, BYOK, webhooks, broadcast, audit activity and transaction history. Invalidate after writes and keep credential reveals, payment/MFA flows, and authorization checks fresh. Return only explicit display metadata from key-list endpoints.

Isolate Chat and Fusion browser history, presets and preferences by user and lock storage during identity changes. Automatically migrate legacy browser history once to the first signed-in account opening Chat, preserve originals, and prevent later accounts from claiming it. Revalidate BYOK and webhook display data after mutations settle without caching revealed credentials.

Revalidate broadcast destinations after creation, wait for every bulk API-key write before invalidating cached lists, and refresh transaction history using the actual refund response.

Cache OAuth app lists/details, beta preferences and broadcast creation options for five minutes. Invalidate after OAuth and beta mutations, and allowlist OAuth display metadata so credentials and authorization tokens never enter the query cache.
