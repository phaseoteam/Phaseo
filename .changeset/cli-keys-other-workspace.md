---
"@phaseo/gateway-api": minor
"@phaseo/cli": minor
---

`phaseo keys list/create/get/update/delete/rotate` accept `--workspace <id-or-slug>` to manage API keys in another workspace where the signed-in person is an owner or admin, without signing in again. The keys API accepts `workspace_id` on these routes only from Phaseo's own CLI and desktop app; API keys, management keys, dashboard sessions and apps that use Sign in with Phaseo still get `403` for any workspace but their own.
