---
"@phaseo/gateway-api": patch
---

Signed-in clients can no longer create or change API keys or management keys directly in the database, or read key hashes; keys are created and changed through Phaseo's API only. Revoked or compromised management keys can no longer be turned back on. Apps that use Sign in with Phaseo can no longer change where workspace content and events go: observability destinations, the I/O logging policy, provider keys (BYOK), private models, request classifiers, data contribution, webhook endpoints, and notification settings, destinations and routes. In workspace settings they can still tighten privacy (turn off I/O logging, training or publishing, or turn on zero data retention) but can't loosen it or change provider restrictions.
