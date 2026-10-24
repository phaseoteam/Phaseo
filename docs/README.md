# Phaseo developer docs

Customer-facing documentation lives at [phaseo.app/docs](https://phaseo.app/docs) and is written in [`apps/docs`](../apps/docs). This folder is for people and agents working on Phaseo itself.

Start with the [contribution guide](../CONTRIBUTING.md), the [development guide](./operations/development.md), and the rules in [AGENTS.md](../AGENTS.md).

## How Phaseo works

Internal notes record architectural decisions, constraints that span components, and traps the source does not make obvious. Most code changes do not need one; follow the [documentation rules](../AGENTS.md#documentation) before adding a page.

- [Architecture overview](./internals/overview.md)
- [Glossary](./internals/glossary.md)
- [Localisation architecture](./architecture/localisation.md)

### Gateway API

- [Provider executor architecture](../apps/api/docs/provider-executor-architecture.md)
- [Database-driven provider adapters](../apps/api/docs/database-driven-provider-adapters.md)
- [Catalogue and routing status model](../apps/api/docs/catalogue-status-model.md)
- [v2 data model](../apps/api/docs/v2-data-model.md)
- [Parameter configuration schema](../apps/api/docs/params-jsonb-schema.md)
- [Provider geographic availability](../apps/api/docs/provider-geographic-availability.md)
- [Workspace pricing tiers](../apps/api/src/pipeline/pricing/TIER-SYSTEM.md)
- [Gateway deployment](../apps/api/docs/internal/regional-deployment.md)
- [Routing explanation storage](../apps/api/docs/internal/routing-storage-rollout.md)
- [Public documentation policy](../apps/api/docs/public-documentation-policy.md)

### Web API, MCP, and data

- [Provider catalogue feed](../apps/web-api/docs/provider-catalog-v1.md)
- [Provider model review](../apps/web-api/docs/provider-model-review.md)
- [MCP plugin workflows](../apps/mcp/docs/plugin-workflows.md)
- [Declarative database schemas](../supabase/DECLARATIVE-SCHEMAS.md)

### Translations

- [Maintaining web translations](../apps/web/LOCALISATION.md)
- [Keeping translated docs current](../apps/docs/TRANSLATION_WORKFLOW.md)

## Operating Phaseo

Maintainer procedures.

- [Development](./operations/development.md)
- [Working safely against production](./operations/production-access.md)
- [Releases and deploys](./operations/release.md)
- [Production database migrations](../.github/PRODUCTION_DATABASE_MIGRATIONS.md)
- [Verifying a change](../.agents/skills/verify-phaseo-change/SKILL.md): the evidence a pull request needs for each area, written as an agent skill
