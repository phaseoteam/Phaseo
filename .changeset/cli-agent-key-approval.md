---
"@phaseo/cli": minor
"@phaseo/gateway-api": minor
"@phaseo/web": minor
"@phaseo/web-api": minor
---

Coding-agent setup (`phaseo codex`, `phaseo claude-code`, `phaseo setup cline` and the rest) now gets its key through browser approval instead of creating it with the CLI sign-in. The CLI asks for a key with `POST /v1/key-requests`, opens a dashboard page that shows exactly what will be created (workspace, key name, spending limit, expiry and the requesting app), and picks the key up once with a PKCE verifier after you approve. Approval needs your own dashboard session, as a workspace owner or admin, with the usual MFA rule; denied and expired requests create nothing. `--key <key>` and `--key-stdin` use a key made in the dashboard instead.
