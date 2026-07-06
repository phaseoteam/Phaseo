# Phaseo npm transition packages

This directory contains temporary transition packages used to reserve and publish the new Phaseo npm names before the full package migration is complete.

Publish order:

1. `phaseo`
2. `@phaseo/sdk`
3. `@phaseo/agent-sdk`
4. `@phaseo/ai-sdk-provider`
5. `@phaseo/cli`
6. `@phaseo/devtools-viewer`

After publishing, deprecate the old `@ai-stats/*` packages with replacement messages.
