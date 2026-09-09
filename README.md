<div align="center">
  <img src="./apps/web/public/logo_dark.svg" alt="Phaseo logo" width="96" />
  <h1>Phaseo</h1>
  <p><strong>Unified AI gateway and model intelligence for teams building with AI APIs.</strong></p>

  <p>
    <a href="https://phaseo.app">Website</a>
    &middot;
    <a href="https://phaseo.app/docs/v1">Docs</a>
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
  <code>pnpm add @phaseo/sdk</code>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <code>pip install phaseo</code>
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
| `packages/data/catalog` | Catalog schemas, archived compatibility fixtures, and daily public database exports. |
| `examples/*` | Small apps and smoke projects for gateway and OAuth flows. |
| `scripts/*` | Catalog, OpenAPI, release, validation, and maintenance tooling. |

## Platform Surface

| Surface | Status | Notes |
| --- | --- | --- |
| Gateway API | Available | OpenAI-compatible endpoints plus Phaseo routing controls. |
| Model and provider catalog | Available | Model metadata, pricing, providers, capabilities, and benchmark context. |
| Web dashboard | Available | Usage, keys, routing, apps, settings, model pages, and internal tools. |
| Docs | Available | Guides, API reference, SDK examples, cookbook, and changelog. |
| SDKs | Available | Public SDK package names, examples, and docs now use Phaseo names across TypeScript, Python, Go, C#, PHP, Ruby, Java, C++, Rust, and Agent SDKs. |

## Local Development

```bash
pnpm install
pnpm --filter @phaseo/web dev
pnpm --filter @phaseo/gateway-api dev
pnpm --filter @phaseo/docs dev
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
- Docs: https://phaseo.app/docs/v1
- API reference: https://phaseo.app/docs/v1/api-reference/introduction
- Issues: https://github.com/phaseoteam/Phaseo/issues
- Good first issues: https://github.com/phaseoteam/Phaseo/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22
- Discord: https://discord.gg/aQyywCvgZ5

## Rebrand Compatibility Note

Phaseo package names and documentation are now the primary public surface. New API keys use the `phaseo_v1_sk_...` prefix. Existing `aistats_...` keys remain accepted during the compatibility window and are scheduled to stop working on 1 January 2027.

## Contributing

Contributions are welcome across the gateway, web app, docs, SDKs, and examples. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening a PR.

For catalog corrections or missing models, providers, pricing, or benchmark results, [open an issue](https://github.com/phaseoteam/Phaseo/issues/new/choose) with the affected page and official sources. Maintainers review reports and update the database through the [internal editor](https://phaseo.app/internal/data), which requires admin access.

The database is the catalog source of truth. Daily public JSON exports remain in `packages/data/catalog/generated/database-v2`; `src/data` contains archived compatibility fixtures. Editing either directory does not update the live catalog, and the legacy JSON importer is retired.

## Security

Report vulnerabilities privately through GitHub Security Advisories or `security@phaseo.app`.

## License

- Core apps (`apps/web`, `apps/api`, `apps/docs`) are AGPL-3.0.
- SDKs under `packages/sdk/*` are MIT.
- Full terms: `LICENSE`.

## Star History

<a href="https://www.star-history.com/?type=date&repos=phaseoteam%2FPhaseo">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=phaseoteam/Phaseo&type=date&theme=dark&legend=top-left&sealed_token=dwcYmLn-7nauxa1NBHvzDXx3yXzBLgKWf29po3bGswiWxYHaNH1vCF1aG1rclilDCh8oxHBOQt935y8HQUjosItu5MlVMC1DMK1icnLjy2lN5UMT8tJyhG8fc_PUyjq853VTVUFU-fG-ma7hcgo669snJpEdtr7gXvMIN7Dnj8SQLrOzASo-1Zlo748R" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=phaseoteam/Phaseo&type=date&legend=top-left&sealed_token=dwcYmLn-7nauxa1NBHvzDXx3yXzBLgKWf29po3bGswiWxYHaNH1vCF1aG1rclilDCh8oxHBOQt935y8HQUjosItu5MlVMC1DMK1icnLjy2lN5UMT8tJyhG8fc_PUyjq853VTVUFU-fG-ma7hcgo669snJpEdtr7gXvMIN7Dnj8SQLrOzASo-1Zlo748R" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=phaseoteam/Phaseo&type=date&legend=top-left&sealed_token=dwcYmLn-7nauxa1NBHvzDXx3yXzBLgKWf29po3bGswiWxYHaNH1vCF1aG1rclilDCh8oxHBOQt935y8HQUjosItu5MlVMC1DMK1icnLjy2lN5UMT8tJyhG8fc_PUyjq853VTVUFU-fG-ma7hcgo669snJpEdtr7gXvMIN7Dnj8SQLrOzASo-1Zlo748R" />
 </picture>
</a>
