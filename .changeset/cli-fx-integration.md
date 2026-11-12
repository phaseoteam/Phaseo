---
"@phaseo/cli": minor
"@phaseo/docs": patch
---

Add `phaseo fx`, which sets up Vercel Labs' fx coding agent with Phaseo. It installs fx with the official installer after confirmation, adds a `phaseo` connection to `~/.fx/settings.json` with up to 256 compatible models, and makes Phaseo the active fx provider. The dedicated key goes to the owner-only `~/.config/phaseo/integrations/fx.env`, which a one-line shell-profile entry loads because fx reads connection keys only from environment variables. `phaseo integrations remove fx` restores the previous provider, deletes the key file and revokes the key.
