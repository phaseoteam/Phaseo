# Phaseo Skills

Reusable coding-agent skills that help teams ship against Phaseo faster. Public skills teach agents to build on Phaseo; internal skills (model onboarding, database changes, changelog and docs writing) are for work on this repository only.

## Where public skills are published

`.agents/skills` is the single source. `scripts/skills/sync.mjs` copies the public skills to:

- `apps/docs/.mintlify/skills`, served by the docs site, so `npx skills add https://phaseo.app/docs` installs them and the Docs MCP lists them;
- `apps/mcp/plugin/phaseo/skills`, bundled in the Phaseo plugin for Codex, ChatGPT and Claude Code.

The [`phaseoteam/skills`](https://github.com/phaseoteam/skills) repository mirrors the docs copy for skills.sh (`npx skills add phaseoteam/skills`).

It also copies every skill, public and internal, to `.claude/skills`, because Claude Code only discovers project skills there. Never edit `.claude/skills` directly; CI fails if it drifts from `.agents/skills` (`pnpm skills:check`).

After editing any skill, run:

```bash
pnpm skills:sync      # copy to the docs, the plugin and .claude/skills
pnpm skills:validate  # frontmatter, structure, evals, links and examples
```

`pnpm skills:check` fails when a published copy is out of date. The docs build runs it.

## Public skills

| Skill | Purpose |
| --- | --- |
| `phaseo-gateway` | REST and SDK integration, auth, model IDs and smoke tests |
| `phaseo-migration` | Moving from OpenAI, Anthropic, OpenRouter, Vercel AI Gateway, LiteLLM, Cloudflare AI Gateway, Helicone or LLM Gateway |
| `openrouter-to-phaseo-migration` | Detailed OpenRouter playbook (key formats, provider routing, plugins) |
| `phaseo-model-selection` | Choosing model IDs by capability, price, context and availability |
| `phaseo-usage-monitoring` | Credits, spend, usage analytics and request debugging |
| `phaseo-sdk-typescript` | `@phaseo/sdk` |
| `phaseo-sdk-python` | `phaseo` |
| `phaseo-agent-sdk-typescript` | Agent loops with `@phaseo/agent-sdk` |
| `phaseo-routing-presets` | Presets, routing policy and response caching |
| `phaseo-guardrails` | Key guardrails, restrictions and budgets |
| `phaseo-async-webhooks` | Async video, batches and webhooks |
| `phaseo-web-search-tools` | Web search and web fetch grounding |
| `phaseo-response-healing` | Structured JSON recovery |
| `phaseo-cli` | The `phaseo` CLI |

The list of public skills lives in `scripts/skills/public-skills.mjs`.

## Authoring rules for public skills

These follow the [Agent Skills specification](https://agentskills.io/specification), [Anthropic's skill authoring best practices](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices) and [OpenAI's skill guidance](https://learn.chatgpt.com/docs/build-skills). `pnpm skills:validate` enforces the mechanical ones.

**Layout**

```text
phaseo-example/
├── SKILL.md              # required; under 500 lines
├── agents/openai.yaml    # required for public skills; Codex and ChatGPT metadata
├── references/*.md       # optional; one level deep, linked from SKILL.md
└── evals/evals.json      # required for public skills; never published
```

**Frontmatter**

- `name`: lowercase letters, digits and hyphens, at most 64 characters, the same as the directory.
- `license`: `MIT` (public skills and the plugin are MIT; the rest of the repository is AGPL).
- `description`: third person, at most 600 characters (the spec allows 1,024, but Codex shortens long descriptions when many skills are installed). Three parts, in this order:
  1. what the skill does, with the trigger words first;
  2. `Use when …` with concrete signals (package names, file patterns, endpoints, user phrasing);
  3. `Not for …` naming what belongs to another skill, and which one.

**Body**

- Write for an agent that is already capable: include only what it would not know about Phaseo.
- Use one term per concept (`model ID`, `API key`, `workspace`, `preset`).
- Give workflows as numbered steps with a checklist the agent can copy, and include a validation step.
- Use `phaseo/free` for smoke tests and placeholder-free examples. Any other model ID in an example must be in `KnownModelId` in `apps/docs/openapi/v1/openapi.yaml` and not be retired; tell agents to confirm IDs with `GET /v1/models`.
- `POST /v1/responses` bodies use `input`; `POST /v1/chat/completions` and `POST /v1/messages` bodies use `messages`.
- No dates or "new"/"latest" claims that go stale; no secrets, even fake-looking ones.
- Reference files over 100 lines start with a table of contents.

**`agents/openai.yaml`**

```yaml
interface:
  display_name: "Phaseo Example"
  short_description: "25 to 64 characters, sentence case, no full stop"
  brand_color: "#0069A8"
  default_prompt: "Use $phaseo-example to …"
policy:
  allow_implicit_invocation: true
dependencies:
  tools:
    - type: "mcp"
      value: "phaseo-docs"
      description: "Phaseo documentation search"
      transport: "streamable_http"
      url: "https://phaseo.app/docs/mcp"
```

Skills that read account data also declare the `phaseo` MCP (`https://mcp.phaseo.app/mcp`).

**`evals/evals.json`**

At least three cases, including at least one where the skill should not trigger. Each case:

```json
{
  "id": "short-kebab-id",
  "query": "What the user asks",
  "files": ["optional fixture paths, relative to evals/"],
  "should_trigger": true,
  "expected_behavior": ["Observable things a correct answer does"]
}
```

Run the cases against Haiku, Sonnet and Opus (or the Codex default model) before and after a change, with and without the skill installed.

## Internal skills

- `phaseo-model-provider-onboarding`: required for every new model; onboard models, routes, capabilities, pricing, plans and benchmarks in Supabase
- `phaseo-internal-model-onboarding`: admin-only model setup, private logs and public exclusion
- `phaseo-database-changes`: schema and RPC migrations, with direct Supabase catalogue updates
- `phaseo-product-docs`: product-facing rewrite workflow for docs, cookbook pages and guides
- `phaseo-release-spotlight`: monthly recap and release spotlight writing workflow
- `phaseo-changelog`: combined, product, SDK and data changelog writing workflow
- `realtime-maintenance`: announced maintenance windows for deploying the `phaseo-realtime` voice relay without ending live calls
- `seo-audit`, `supabase-postgres-best-practices`, `yeet`: general development helpers
