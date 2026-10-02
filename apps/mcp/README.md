# Phaseo MCP server

The Phaseo MCP server provides authenticated model discovery, pricing, usage, request-health information, and reviewed text inference from its interactive explorer.

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

Catalogue and account tools remain read-only and never expose historical prompts,
responses, credentials, or raw control-plane records. The app-only inference tools
accept a new user prompt and return its generated text after explicit Run approval.
Administrative writes remain outside the MCP.

Model rankings remain evidence-based and independent of Gateway availability. Tool results report whether a model is currently routable through the Phaseo Gateway and provide its Gateway model ID, but availability never changes benchmark order or price sorting.

## Model explorer

`models_list` opens an MCP App with model search, provider and input-modality filters,
model details, a shortlist of up to three models, and token cost estimates. The UI
uses the MCP Apps host bridge and the existing OAuth-scoped tools. It makes no
direct API requests and contains no credentials. Hosts without MCP Apps support
continue to receive the same structured model results.

The view advertises fullscreen mode (the Codex side panel), a global sidebar entrypoint,
and a thread entrypoint. Its tool icon uses the Phaseo logo in a monochrome 20px SVG.
Add to chat context attaches a small catalogue snapshot for the next message without sending
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

## Shortlists, examples, usage, and inference

Saved shortlists retain only names and up to three model IDs in host/device-local
browser storage. They are not account-synced. Unsupported storage produces an explicit
error. Details for eligible Gateway text chat models include TypeScript, Python, and
POSIX curl examples that read `PHASEO_API_KEY` from the user's environment.

Usage shows available/reserved credits, 30-day totals, UTC-dated model analytics,
and up to 20 request-health records from the last 24 hours. Missing OAuth permissions
affect individual panels rather than preventing access to the explorer.

Try prompt supports one to three plain-text model runs, up to 8,000 characters and
2,048 output tokens per model. `inference_quote` validates capabilities, chooses a
concrete provider with complete USD token prices, and signs a five-minute estimate
bound to user/client/workspace, prompt hash, model/provider IDs, and output limits.
`inference_run` requires `gateway:access` and an explicit user Run action. Both tools
are app-only; the language model cannot initiate inference through normal tool use.

Default OAuth connections stay read-only. The protected resource advertises optional
`gateway:access`; dynamic registration permits it only in an explicit supported
scope request. Broad administrative scope requests still negotiate down to read-only
catalogue scopes. Existing clients without this allowed scope require a new connection
registration and user consent. Tool-level insufficient-scope metadata lets supported
hosts request consent; actual host upgrade behavior must be verified after release.

The MCP forwards the original resource-bound delegated key, not its control-plane
JWT, to `/v1/chat/completions`. The Gateway accepts this only with the existing MCP
resource-server secret, the matching resource header, and active `gateway:access`
consent. Normal key/workspace policy, credit reservations, billing, and audit apply.
Routing that changes a reviewed model/provider/prompt/output limit, enables model
fallbacks, or adds Gateway plugins is rejected before execution.

An `InferenceRunReceipt` Durable Object claims each quote once before submission,
including concurrent requests and Worker restarts. It stores only a claimed flag and
deletes it after quote expiry. Outputs are not saved by the MCP. Errors/timeouts never
cause automatic resubmission; users should inspect request history before a new run.
Each model request has a two-minute timeout and responses are capped at 1 MiB.

The estimate budget (maximum $1 total) is an estimate filter, not a guaranteed billing
cap. Input estimates use prompt UTF-8 bytes plus framing allowance; actual provider
tokenization and billing can differ. No media, tools, streaming, or replay is supported.
Deployment requires the API auth/policy changes and MCP Durable Object migration.

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
