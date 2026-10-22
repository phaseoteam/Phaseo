---
"@phaseo/gateway-api": patch
"@phaseo/sdk": minor
---

API keys accept and return `storage_locations`: where you keep the key (for example `railway`, `vercel`, `github`, `1password`), up to 8 ids. Set it when creating or updating a key, clear it with `null` or `[]`; a rotated key keeps it. Revoked keys now answer `409 key_revoked` instead of being turned back on.
