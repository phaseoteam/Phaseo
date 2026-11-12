---
"@phaseo/mcp": minor
"@phaseo/gateway-api": minor
"@phaseo/web": patch
---

Let agents manage a Phaseo account through the MCP when the user opts in. Connecting to `https://mcp.phaseo.app/mcp?access=manage` asks for account-management permissions, which the consent screen lists one by one. The MCP then adds list, create, update and delete tools for API keys (including rotate), budgets, spend rules, provider keys (BYOK), guardrails (including setting their keys), presets (including publishing a version), workspace settings, webhooks and observability destinations. Each tool needs the same OAuth scope as its Management API route and carries read-only, destructive and idempotent annotations so clients ask before changes. New API key and webhook secrets are returned once and flagged; stored credentials are never returned. The plain `/mcp` URL stays read-only.

The OAuth server now accepts these management scopes from dynamically registered clients when they name them explicitly for the Phaseo MCP resource. The consent screen gains a label for spend rule permissions.
