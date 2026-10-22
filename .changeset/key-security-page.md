---
"@phaseo/web": minor
"@phaseo/web-api": patch
---

New Key security page (Settings → Key Security): see which API keys have no spend limit, never expire, have been idle for 90 days, are safe to remove, have no IP allowlist or no recorded storage location, and fix them in bulk (pause, revoke, set a monthly spend limit, an expiry or a storage location for up to 500 keys at once). Keys are grouped by where they are stored, with one-step "Revoke all" for a platform that reports a breach, and the owner list copies as CSV.
