<div align="center">
  <img src="./apps/web/public/logo_dark.svg" alt="Phaseo logo" width="96" />
  <h1>Phaseo</h1>
  <p><strong>Unified AI gateway and model intelligence for teams building with AI APIs.</strong></p>

  <p>
    <a href="https://phaseo.app">Website</a>
    &middot;
    <a href="https://docs.phaseo.app/v1">Docs</a>
    &middot;
    <a href="https://github.com/phaseoteam/Phaseo/issues">Issues</a>
    &middot;
    <a href="https://discord.gg/aQyywCvgZ5">Discord</a>
  </p>

  <p>
    <a href="https://github.com/phaseoteam/Phaseo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/phaseoteam/Phaseo/actions/workflows/ci.yml/badge.svg" /></a>
    <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0%20(core)%20%7C%20MIT%20(SDKs)-2563eb" /></a>
    <a href="https://securityscorecards.dev/viewer/?uri=github.com/phaseoteam/Phaseo"><img alt="OpenSSF Scorecard" src="https://api.securityscorecards.dev/projects/github.com/phaseoteam/Phaseo/badge" /></a>
  </p>
</div>

<p align="center">
  <code>pnpm add @ai-stats/sdk</code>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <code>pip install ai-stats-py-sdk</code>
</p>

Phaseo combines a production AI gateway with the model, provider, pricing, benchmark, and reliability data teams need when choosing what to run in production.

Use it to:

- route requests through one OpenAI-compatible API;
- compare model quality, price, latency, throughput, and provider coverage;
- observe spend and reliability across teams and apps;
- build against SDKs, management APIs, and routing controls from one repo.

## Why Phaseo

Choosing an AI model is no longer just a leaderboard decision. Production teams need to know which model is available, which provider can serve it, what it costs, how it behaves under load, and how to switch when requirements change.

Phaseo keeps those decisions in one place: the gateway handles requests, while the catalog and dashboard make the tradeoffs visible.

## Quickstart

Create an API key at `https://phaseo.app`, then call the gateway:

```bash
curl https://api.phaseo.app/v1/chat/completions \
  -H "Authorization: Bearer $PHASEO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5-nano-2025-08-07",
    "messages": [{"role": "user", "content": "Say hello from Phaseo."}]
  }'
```

Or use the OpenAI-compatible TypeScript client:

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});

const response = await client.chat.completions.create({
  model: "gpt-5-nano-2025-08-07",
  messages: [{ role: "user", content: "Summarize Phaseo in one sentence." }],
});

console.log(response.choices[0]?.message?.content);
```

## What Is In This Repo

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js product, dashboard, model catalog, gateway UI, blog, and public site. |
| `apps/api` | Cloudflare Workers + Hono gateway API. |
| `apps/docs` | Mintlify documentation and OpenAPI reference. |
| `packages/sdk/*` | TypeScript, Python, Go, C#, PHP, Ruby, Java, C++, Rust, and Agent SDK packages. |
| `packages/data/catalog` | Canonical model, provider, pricing, benchmark, and catalog data. |
| `examples/*` | Small apps and smoke projects for gateway and OAuth flows. |
| `scripts/*` | Catalog, OpenAPI, release, validation, and maintenance tooling. |

## Platform Surface

| Surface | Status | Notes |
| --- | --- | --- |
| Gateway API | Available | OpenAI-compatible endpoints plus Phaseo routing controls. |
| Model and provider catalog | Available | Model metadata, pricing, providers, capabilities, and benchmark context. |
| Web dashboard | Available | Usage, keys, routing, apps, settings, model pages, and internal tools. |
| Docs | Available | Guides, API reference, SDK examples, cookbook, and changelog. |
| SDKs | In progress | Current package names remain `@ai-stats/*` / `ai-stats-*` until the Phaseo package migration is completed. |

## Local Development

```bash
pnpm install
pnpm --filter @ai-stats/web dev
pnpm --filter @ai-stats/gateway-api dev
pnpm --filter @ai-stats/docs dev
```

Common checks:

```bash
pnpm lint
pnpm typecheck
pnpm validate:data
pnpm validate:pricing
pnpm validate:gateway
pnpm docs:build
```

## Resources

- Website: https://phaseo.app
- Docs: https://docs.phaseo.app/v1
- API reference: https://docs.phaseo.app/v1/api-reference/introduction
- Issues: https://github.com/phaseoteam/Phaseo/issues
- Good first issues: https://github.com/phaseoteam/Phaseo/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22
- Discord: https://discord.gg/aQyywCvgZ5

## Package Migration Note

The product is now Phaseo, but package names are being migrated separately. Until the Phaseo package names are reserved and published, install commands may still use `@ai-stats/*`, `ai-stats-*`, and related legacy package identifiers. Existing API keys and current package names are expected to keep working during the migration.

## Contributing

Contributions are welcome across the gateway, web app, docs, SDKs, examples, and catalog data. Read `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` before opening a PR.

## Security

Report vulnerabilities privately through GitHub Security Advisories or `security@phaseo.app`.

## License

- Core apps (`apps/web`, `apps/api`, `apps/docs`) are AGPL-3.0.
- SDKs under `packages/sdk/*` are MIT.
- Full terms: `LICENSE`.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=phaseoteam/Phaseo&type=Date)](https://star-history.com/#phaseoteam/Phaseo&Date)
