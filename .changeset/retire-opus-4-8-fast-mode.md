---
"@phaseo/gateway-api": patch
"@phaseo/desktop": patch
---

From 30 November 2026, Anthropic no longer serves Fast Mode on Claude Opus 4.8. A `fast` or `priority` service tier for `anthropic/claude-opus-4.8` on Anthropic's own API now returns a clear `service_tier_not_supported` error. It is no longer served at standard speed or charged, and `/v1/models` stops listing `priority` for those routes. Standard and batch, other Claude models and other providers are unchanged. In the desktop app, Claude Opus 4.8 no longer offers Fast Mode in the Claude Code picker, and a task with Fast Mode saved stops with a message asking you to pick another model.
