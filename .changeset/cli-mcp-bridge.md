---
"@phaseo/cli": minor
"@phaseo/gateway-api": minor
"@phaseo/mcp": patch
---

Add `phaseo mcp`, which runs the Phaseo MCP over stdio for local agents using your `phaseo login`, with no second sign-in. The CLI swaps its own token for a 15-minute token that only the Phaseo MCP accepts (a token exchange only the first-party CLI can use, never with more access than the login has and never with paid model calls). It is read-only unless you pass `--manage`. The Codex profile from `phaseo setup codex` now includes it, and `phaseo setup claude-code` shows the `claude mcp add` command. When the MCP is reached through `phaseo mcp`, log, activity and analytics results suggest the matching CLI command for full data. Every MCP tool that changes the workspace now states the confirm-first and no-retry rules in its own description.
