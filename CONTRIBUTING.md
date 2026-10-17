# Contributing to Phaseo

Thanks for your interest in contributing to Phaseo.

Phaseo is built in public. We welcome contributions across the web app, gateway API, SDKs, docs, and data. Review capacity is limited, so meeting this guide makes a pull request ready for review; it does not guarantee a merge. We may ask for a smaller scope, defer it, or close it.

## Ways to contribute

- Code improvements (bug fixes, reliability and performance fixes, tests, and agreed features)
- Data corrections (model metadata, pricing, provider availability, benchmarks), through issues
- Documentation improvements (guides, examples, API docs, translations, broken links)
- Bug reports with reproduction steps, and developer feedback

Issues labelled [good first issue](https://github.com/phaseoteam/Phaseo/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or [help wanted](https://github.com/phaseoteam/Phaseo/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) are good starting points when there are any.

## Catalogue data

For catalogue changes, no development setup or pull request is needed. [Report incorrect information](https://github.com/phaseoteam/Phaseo/issues/new?template=incorrect-info.yml) or [request missing data](https://github.com/phaseoteam/Phaseo/issues/new?template=data-request.yml). Include the affected page or record ID, the proposed change, and official sources. For pricing, include the provider, currency, units, and effective date; for benchmark results, include the evaluation method and citation.

Maintainers review the issue and apply approved changes through the admin-only [catalogue editor](https://phaseo.app/internal/data). The database is authoritative; the repository holds no catalogue JSON. Code, schema, and documentation changes go through pull requests.

## Establish the problem first

- **Bugs:** open a [bug report](https://github.com/phaseoteam/Phaseo/issues/new?template=bug.yml) with the expected behaviour, what happened instead, and steps to reproduce. A small, obvious fix can go straight to a pull request if it explains the defect.
- **Features and behaviour changes:** open a [feature request](https://github.com/phaseoteam/Phaseo/issues/new?template=feature.yml) or an [Ideas discussion](https://github.com/phaseoteam/Phaseo/discussions/categories/ideas) and wait for a maintainer to agree on the direction and scope before building it. Link that agreement in your pull request.
- Search existing issues, discussions, and the [docs](https://phaseo.app/docs) before starting.

## Solve one problem per pull request

Include everything that one problem needs: the API, SDK, database, web, test, and documentation changes. An unrelated cleanup, refactor, or second fix belongs in its own pull request.

## Development setup

```bash
git clone https://github.com/phaseoteam/Phaseo.git
cd Phaseo
pnpm install
pnpm --filter @phaseo/web dev          # web app
pnpm --filter @phaseo/gateway-api dev  # gateway API
pnpm --filter @phaseo/docs dev         # docs site
```

The [development guide](./docs/operations/development.md) covers prerequisites, environment files, running scoped tests, and previewing the docs. The [architecture overview](./docs/internals/overview.md) and [glossary](./docs/internals/glossary.md) explain how the pieces fit together.

## Checks before requesting review

Run the checks for the packages you changed, and make sure they pass. Do not run the whole monorepo's checks at once. CI runs only part of the test suites (see [What CI covers](./docs/operations/development.md#what-ci-covers)), so your local run is often the only one for the code you touched.

- **Gateway API:** `pnpm --filter @phaseo/gateway-api exec vitest run src/<area>` and `pnpm --filter @phaseo/gateway-api lint` (ESLint and typecheck).
- **Web app:** `pnpm --filter @phaseo/web test --runTestsByPath <files>`, `pnpm --filter @phaseo/web typecheck`, ESLint on the files you changed, and `pnpm --filter @phaseo/web validate:i18n` when you change interface copy.
- **Database:** `pnpm db:schema:check` and the relevant SQL tests (see [supabase/AGENTS.md](./supabase/AGENTS.md)).
- **API contract and SDKs:** edit `apps/docs/openapi/v1/openapi.yaml`, run `pnpm openapi:gen`, and run the tests for the SDKs you touched (`pnpm test:sdk-<language>`).
- **Docs:** `pnpm docs:links` and `pnpm docs:build`.

## Pull requests

- **Title:** a conventional commit prefix and what is different now, in plain language, for example `fix(web): model pages no longer time out on cold starts`.
- **Description:** fill in every section of the [pull request template](./.github/PULL_REQUEST_TEMPLATE.md): what changed, why (with the evidence that prompted it), how, before and after (measured the same way, side by side), and verification (commands with their results, and anything you could not check). "Tests pass" alone is not enough.
- **UI changes:** include before and after screenshots, and a short recording when motion or timing matters. Attach them to the pull request; do not commit screenshots to the repository.
- **Agent-written changes:** you are responsible for them like any other code. End the description with the model and harness that did the work, as described in [AGENTS.md](./AGENTS.md#model-line).
- Add or update tests when you change behaviour, and add a changeset when a published package or API changes (see [Releases](./docs/operations/release.md)).

## Review SLAs

For ready pull requests with passing checks and clear scope:

- Initial maintainer review target: within 4 calendar days.
- Follow-up review target after requested updates: within 2 business days.

Notes:

- SLA targets apply to complete pull requests. Missing context or failing checks may pause review.
- Complex or high-risk changes may take longer.
- Review does not guarantee merge; maintainers may request changes, re-scoping, or deferment.

## Releases

Versioning and changelogs use Changesets. Create an entry with `pnpm changeset`. The [release guide](./docs/operations/release.md) explains how merged changes are deployed and how packages are published.

## Code of Conduct

By participating, you agree to follow the project [Code of Conduct](./CODE_OF_CONDUCT.md).

## Security reporting

Do not open public issues for vulnerabilities. Follow [SECURITY.md](./SECURITY.md).
