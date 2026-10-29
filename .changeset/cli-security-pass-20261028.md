---
"@phaseo/cli": minor
---

Security hardening: resolve package managers to absolute paths on Windows (also for `phaseo update`), require `--allow-custom-api-url` or `PHASEO_ALLOW_CUSTOM_API_URL=1` to sign in to a non-Phaseo API host and show that host in `whoami`, open server-supplied links only on https://phaseo.app, keep the macOS keychain session and the Hermes key out of process arguments, create integration keys with a 90-day expiry and a $100 monthly spend limit and rotate them near expiry, keep or revoke integration keys on re-login, and strip terminal control characters from server text in older list and detail views.
