# Phaseo MCP server

The Phaseo MCP server provides authenticated, read-only access to live model, provider, pricing, usage, and request-health information.

It reuses Phaseo OAuth permissions rather than creating a second identity system. Administrative operations remain available through the dashboard, CLI, and Management API.

## Public tool boundary

The MCP server supports:

- model search, deterministic price sorting, model details, and structured provider support;
- named general, coding, agentic, and evaluation-cost benchmark rankings;
- provider availability;
- model cost estimates;
- credit balance and recent activity;
- aggregated analytics;
- privacy-minimized request and generation metadata.

It does not expose billable inference, administrative writes, credential values, prompts, responses, or raw control-plane records.

Model rankings remain evidence-based and independent of Gateway availability. Tool results report whether a model is currently routable through the Phaseo Gateway and provide its Gateway model ID, but availability never changes benchmark order or price sorting.

## Model explorer

`models_list` opens an MCP App with model search, provider and input-modality filters,
model details, a shortlist of up to three models, and token cost estimates. The UI
uses the MCP Apps host bridge and the existing OAuth-scoped tools. It makes no
direct API requests and contains no credentials. Hosts without MCP Apps support
continue to receive the same structured model results.

The view advertises fullscreen mode (the Codex side panel), a global sidebar entrypoint,
and a thread entrypoint. Its tool icon uses the Phaseo logo in a monochrome 20px SVG.
Use in chat attaches a small catalogue snapshot for the next message without sending
a message or changing the conversation's model. The host must support model context.
Get link exposes a selectable hosted plugin URL for a model or comparison; links
restore live details via `model_get`. The plugin ID in `ui/integration.ts` belongs to
the existing private Phaseo plugin; other installations must use their own ID.
Price/context/provider sorting and the Gateway filter use existing server parameters.
It renders the initial search result without repeating the opener call. Each search
returns up to 20 matching models; refine the filters to find other models.

Run `pnpm --filter @phaseo/mcp build:ui` to bundle the React interface and MCP Apps SDK
into a self-contained HTML resource. Development, test, typecheck, and Worker build
commands rebuild it automatically. Generated files are ignored by Git.

To verify in a host, connect the local Worker, complete Phaseo OAuth, and invoke
`models_list` or open the **Model explorer** thread entrypoint. Check search, empty
and error states, model details, comparison, cost estimates, and light/dark themes.
Also check global navigation, Use in chat, and initial/subsequent model deep links.
The fixture host displays attached context and accepts `?path=` with an encoded
`/models?ids=example/atlas,example/spark` route. Actual host navigation and link
authorization require the deployed Worker and connected plugin.

## Run locally

1. Copy `.dev.vars.example` to `.dev.vars` and use non-production values.
2. Start the API and MCP Workers with their normal development commands.
3. Connect MCP Inspector to the local `/mcp` endpoint shown by Wrangler.
4. Complete Phaseo login and consent.

For UI development without account access, run `pnpm --filter @phaseo/mcp dev:ui`
and open `http://127.0.0.1:4318`. This development-only host uses the official MCP
Apps bridge with labeled fixture data. It is never included in the Worker bundle.

## Plugin release

The `plugin/phaseo` directory contains the existing plugin's portable source,
compatibility manifests, workflow skill, and Phaseo logos. Run
`pnpm --filter @phaseo/mcp build:plugin` to create `dist/plugin/phaseo.tar.gz`.
Deploy the MCP Worker through the repository's PR release flow before uploading
this package as an update to the existing private plugin. Then reconnect the
plugin and verify the explorer in the target host with Phaseo OAuth.

## Validation

```bash
pnpm --filter @phaseo/mcp cf-typegen
pnpm --filter @phaseo/mcp typecheck
pnpm --filter @phaseo/mcp test
pnpm --filter @phaseo/mcp build
```
