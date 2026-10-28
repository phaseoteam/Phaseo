# Phaseo MCP server

The Phaseo MCP server provides authenticated model discovery, pricing, usage, request-health information, and reviewed text inference from its interactive explorer.

It reuses Phaseo OAuth permissions rather than creating a second identity system. Billing, workspace and other administrative operations remain in the dashboard, CLI, and Management API.

## Public tool boundary

The MCP server supports:

- model search, deterministic price sorting, model details, and structured provider support;
- named general, coding, agentic, and evaluation-cost benchmark rankings;
- provider availability;
- model cost estimates;
- credit balance and recent activity;
- aggregated analytics;
- privacy-minimized request and generation metadata;
- opt-in account management (see below).

Catalogue and usage tools remain read-only and never expose historical prompts,
responses, credentials, or raw control-plane records. The app-only inference tools
accept a new user prompt and return its generated text after explicit Run approval.

## Account management

Connecting to `https://mcp.phaseo.app/mcp?access=manage` opts in to account
management. Its OAuth challenge and protected-resource metadata also request
`MCP_MANAGEMENT_SCOPES` (`src/management.ts`): read, write and delete for API keys,
budgets, spend rules, provider keys (BYOK) and guardrails; read and write for
presets and settings. The plain `/mcp` URL never requests them.

The API grants these scopes to a dynamically registered client only when it names
them itself for the `https://mcp.phaseo.app/mcp` resource and asks for nothing outside
the MCP scope list (`filterMcpAuthorizationScopes` in `apps/api/src/routes/oauth.ts`).
Broader requests are still narrowed to read-only or rejected. The consent screen lists
every scope with a Read, Write or Delete badge and a checkbox, so the user can allow
only some of them. Metadata-document (CIMD) clients stay read-only for now.

Each tool calls the existing `/v1` Management API route with the user's
resource-bound upstream token, so route scope checks, workspace roles and audit
events all apply. A tool is registered only when its route scope was granted and the
connection either uses the manage URL or holds at least one management write or
delete scope, so older read-only connections keep their tool list. A read-only
connection opened with the manage URL gets a 403 `insufficient_scope` challenge
that asks the client to sign in again.

Annotations: list and get tools are read-only; create tools are additive and not
idempotent; update, rotate, set and delete tools are destructive, so clients that
honour annotations ask before calling them. New API key and webhook signing secrets
come back once in `oneTimeSecret` and are stripped from `result`. Stored provider keys,
destination credentials and encrypted fields are never returned. 5xx error details are
redacted; 4xx messages are passed through with the HTTP status.

There are no billing, payment, workspace, member, management-key or OAuth-app tools.

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

## Plugin

`plugin/phaseo` is one plugin for Codex, ChatGPT and Claude Code. It bundles:

- the Phaseo MCP (`https://mcp.phaseo.app/mcp`, OAuth) and the Phaseo Docs MCP
  (`https://phaseo.app/docs/mcp`, no sign-in);
- the `phaseo` skill, which covers the MCP tools and lives only here;
- the public skills from `.agents/skills`, copied by `pnpm skills:sync` at the
  repository root. Do not edit `plugin/phaseo/skills/<public-skill>` directly.

Each host reads its own manifest, so keep them in step (`pnpm skills:validate`
checks the versions and paths):

| File | Read by |
| --- | --- |
| `plugin.json` | Portable Agent Plugins format; ChatGPT and Codex (`extensions.com.openai`) |
| `.codex-plugin/plugin.json` | Codex compatibility layout, for hosts that do not read `plugin.json` |
| `.claude-plugin/plugin.json` | Claude Code; declares the MCP servers with `type: "http"` |
| `.mcp.json`, `mcp.json` | Codex and portable hosts (`streamable-http`) |
| `README.md` | Directory listings and the mirror; required by Anthropic's plugin directory |
| `../openai-submission.json` | Only the OpenAI directory package: review cases and release notes |

The repository root has a marketplace for each host
(`.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`). Users
install from the small `phaseoteam/skills` mirror rather than this repository:

```bash
# Claude Code
/plugin marketplace add phaseoteam/skills
/plugin install phaseo@phaseo

# Codex
codex plugin marketplace add phaseoteam/skills
codex plugin add phaseo@phaseo
```

To test local changes, run `claude plugin validate apps/mcp/plugin/phaseo` and
`claude --plugin-dir apps/mcp/plugin/phaseo`, or add the repository root as a
Codex marketplace with a throwaway `CODEX_HOME`.

### Release

Bump `version` in all three manifests together. Run
`pnpm --filter @phaseo/mcp build:plugin` to create:

- `dist/plugin/phaseo.tar.gz`, the plugin directory as it is;
- `dist/plugin/phaseo-openai-<version>.zip`, the package for OpenAI's plugin
  directory (ChatGPT and Codex). That directory connects one MCP server per
  plugin, so the ZIP keeps only the Phaseo MCP. It also merges in the review
  cases, commerce answer and release notes from `plugin/openai-submission.json`.
  Pass `--demo-url <url>` to include the demo recording, or add it in the
  dashboard.

Deploy the MCP Worker through the repository's PR release flow before uploading
a package. Then reconnect the plugin and verify the explorer in the target host
with Phaseo OAuth. Each directory upload is reviewed again, so update
`publication.release_notes` for every version.

Anthropic's plugin directory takes the plugin from the `phaseoteam/skills`
mirror (`plugins/phaseo`), which the daily sync keeps up to date. The plugin
README is required there, and `pnpm skills:validate` checks it and the
OpenAI listing limits.

Keep reviewer credentials out of every package. Enter them in the OpenAI
dashboard under Review details.

## Validation

```bash
pnpm --filter @phaseo/mcp cf-typegen
pnpm --filter @phaseo/mcp typecheck
pnpm --filter @phaseo/mcp test
pnpm --filter @phaseo/mcp build
```
