---
"@phaseo/gateway-api": patch
---

Signed-in clients can no longer create or change API keys or management keys directly in the database, or read key hashes; keys are created and changed through Phaseo's API only. Revoked or compromised management keys can no longer be turned back on. Apps that use Sign in with Phaseo can no longer create, change or remove observability destinations, the I/O logging policy, provider keys (BYOK) or webhook endpoints.
