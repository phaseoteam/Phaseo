---
"@phaseo/web-api": patch
---

Treat a password-only session as signed out when the account has a verified second factor. The website already sent such sessions to its code-entry page, but direct calls to `/api/account/*` accepted them.
