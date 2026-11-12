---
"@phaseo/desktop": patch
"@phaseo/slack-agent": patch
"@phaseo/mcp": patch
---

Factory's threads no longer load a repository's own agent settings, hooks, plugins or MCP configs (Claude, Cursor, Pi and OpenCode), failed-check logs reach agents fenced as data, and a fork's failed checks are held back. The Slack agent drops web search and web fetch when it can read the workspace's usage, posts replies without link previews, and shows saved pins and skills as people's words, not its own instructions. The Phaseo MCP marks creating keys, provider keys, webhooks and observability destinations as destructive, and the last two as reaching outside Phaseo.
