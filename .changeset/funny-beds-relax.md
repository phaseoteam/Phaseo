---
"@ai-stats/sdk": patch
"@ai-stats/ai-sdk-provider": patch
"@ai-stats/devtools-viewer": patch
"@ai-stats/py-sdk": patch
---

Bundle devtools core primitives directly into the TypeScript SDK and devtools viewer so runtime installs no longer depend on `@ai-stats/devtools-core`.

Also harden publish reliability by validating `NPM_TOKEN` in CI and fixing Python `pyproject.toml` version sync.
