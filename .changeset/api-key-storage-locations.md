---
"@phaseo/gateway-api": patch
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/rust-sdk": minor
"@phaseo/cpp-sdk": minor
---

API keys accept and return `storage_locations`: where you keep the key (for example `railway`, `vercel`, `github`, `1password`), up to 8 ids. Set it when creating or updating a key, clear it with `null` or `[]`; a rotated key keeps it. Revoked keys now answer `409 key_revoked` when asked to turn back on.
