---
"@phaseo/mcp": patch
"@phaseo/docs": patch
---

The Phaseo MCP's account management connection now offers only the changes the API accepts from it. Budgets, spend rules, provider keys, guardrails, presets, webhooks and observability destinations stay readable but are changed in the dashboard, so agents no longer see tools that always fail. API key creation and rotation are offered only through `phaseo mcp --manage`; other clients can rename and delete keys. The CLI and MCP docs, in every language, now cover `phaseo mcp` and list what each connection can read and change.
