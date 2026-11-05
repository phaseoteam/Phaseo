---
"@phaseo/cli": minor
"@phaseo/gateway-api": minor
---

`phaseo workspaces use <id-or-slug>` switches the signed-in CLI session to another workspace you own or administer, so `phaseo keys`, settings, credits, presets and every other workspace command can act there. The API's new `POST /oauth/cli/workspace` issues that session; it accepts only the CLI's own sign-in, never an API key, management key or another app's token.
