# Contributing to AI Stats

Thanks for your interest in contributing to AI Stats.

AI Stats is built in public. We welcome contributions across the web app, gateway API, SDKs, docs, and data.

## Ways to contribute

- Code improvements (features, bug fixes, refactors, tests)
- Data improvements (model metadata, provider mappings, benchmark updates)
- Documentation improvements (guides, examples, API docs, broken links)
- Issue triage, reproduction reports, and developer feedback

Good starting point: [Good First Issues](https://github.com/AI-Stats/AI-Stats/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

## Development setup

```bash
git clone https://github.com/AI-Stats/AI-Stats.git
cd AI-Stats
pnpm install
pnpm dev
```

Useful scoped commands:

```bash
pnpm --filter @ai-stats/web dev
pnpm --filter @ai-stats/gateway-api dev
pnpm --filter @ai-stats/docs dev
```

## Quality bar before requesting review

Before you mark a PR "ready for review", run checks relevant to your changes and ensure they pass locally:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Additional checks by area:

- Web/data changes: `pnpm validate:data`, `pnpm validate:pricing`, `pnpm validate:gateway`, and relevant tests.
- Docs changes: `pnpm docs:links` and `pnpm docs:build`.
- API/SDK/OpenAPI changes: run generation/validation steps required by the touched area.

If checks fail, fix them before requesting review.

## Pull request guidelines

- Keep PRs focused and reasonably small.
- Use clear commit messages and PR descriptions.
- Link related issues (for example: `Closes #123`).
- Include migration notes, rollout notes, or screenshots when relevant.
- If you change behavior, add or update tests.

## Review SLAs

For ready PRs with passing checks and clear scope:

- Initial maintainer review target: within 4 calendar days.
- Follow-up review target after requested updates: within 2 business days.

Notes:

- SLA targets apply to complete PRs. Missing context or failing checks may pause review.
- Complex or high-risk changes may take longer.
- Review does not guarantee merge; maintainers may request changes, re-scoping, or deferment.

## Release workflow (changesets)

This monorepo uses Changesets for versioning and changelogs.

- Create changeset entries with `pnpm changeset`.
- Version packages with `pnpm changeset:version`.
- Sync Python package version when needed with `pnpm sdk-py:sync-version`.

For full release mechanics, see `CHANGESETS.md`.

## Code of Conduct

By participating, you agree to follow the project Code of Conduct:

- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

## Security reporting

Do not open public issues for vulnerabilities.

- Follow: [SECURITY.md](./SECURITY.md)
