---
"@phaseo/cli": minor
---

Security hardening: resolve package managers to absolute paths on Windows (also for `phaseo update`), require `--allow-custom-api-url` or `PHASEO_ALLOW_CUSTOM_API_URL=1` to sign in to a non-Phaseo API host and show that host in `whoami`, open server-supplied links only on https://phaseo.app, store the macOS session encrypted with a Keychain-held data key and keep it and the Hermes key out of process arguments, write Hermes' key as a delimited managed block in its .env (atomic, symlinks refused, other lines untouched), create integration keys with a 90-day expiry and a $100 monthly spend limit and replace expired ones, keep integration keys on re-login only for the same API, account and workspace (otherwise revoke them), and strip terminal control characters from server text in older list and detail views.
