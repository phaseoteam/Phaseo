# Phaseo MCP server

The Phaseo MCP server provides authenticated, read-only access to live model, provider, pricing, usage, and request-health information.

It reuses Phaseo OAuth permissions rather than creating a second identity system. Administrative operations remain available through the dashboard, CLI, and Management API.

## Public tool boundary

The MCP server supports:

- model search, deterministic price sorting, and model details;
- named general, coding, agentic, and evaluation-cost benchmark rankings;
- provider availability;
- model cost estimates;
- credit balance and recent activity;
- aggregated analytics;
- privacy-minimized request and generation metadata.

It does not expose billable inference, administrative writes, credential values, prompts, responses, or raw control-plane records.

Model rankings remain evidence-based and independent of Gateway availability. Tool results report whether a model is currently routable through the Phaseo Gateway and provide its Gateway model ID, but availability never changes benchmark order or price sorting.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars` and use non-production values.
2. Start the API and MCP Workers with their normal development commands.
3. Connect MCP Inspector to the local `/mcp` endpoint shown by Wrangler.
4. Complete Phaseo login and consent.

## Validation

```bash
pnpm --filter @phaseo/mcp cf-typegen
pnpm --filter @phaseo/mcp typecheck
pnpm --filter @phaseo/mcp test
pnpm --filter @phaseo/mcp build
```
