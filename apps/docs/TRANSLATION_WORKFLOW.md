# Keeping translated docs current

The docs build checks page coverage and whether each translation is aligned with the English source version it was last reviewed against. The source hashes live in `translation-status.json`, one entry per locale and page. It also tracks the OpenAPI text source as one review unit per locale.

The initial baseline has already been created for the existing translation set. When setting up a new branch that does not contain the manifest, run `pnpm --filter @phaseo/docs translation:freshness:init` once. This command refuses to overwrite an existing baseline and records only locale pages that currently exist.

## Review changes

Run this before or during a docs change:

```sh
pnpm --filter @phaseo/docs translation:freshness:check
```

To audit translations against another revision without checking it out, such as remote `main`:

```sh
pnpm --filter @phaseo/docs exec node scripts/translation-freshness.mjs check --source-ref origin/main
```

The report identifies missing locale pages, changed English pages whose translations need review, translated files with no recorded baseline, and locale pages whose English source was removed.

## Record reviewed translations

After translating or reviewing a page, update its source hash for that locale:

```sh
pnpm --filter @phaseo/docs translation:freshness:record --locale es --page guides/quickstart.mdx
```

For work based on a source revision that is not checked out, pass the same revision explicitly:

```sh
pnpm --filter @phaseo/docs translation:freshness:record --locale es --page guides/new-guide.mdx --source-ref origin/main
```

Record each locale separately after its translation has been reviewed. Pages removed from English that have an explicit Mintlify redirect are reported as redirected and may remain in the locale tree as archived translations. Remove locale copies of retired pages that have no redirect once their replacement is decided; the checker reports those as orphaned.

When OpenAPI summaries, descriptions, or parameter text change, update the localized OpenAPI copy and record that locale's source version:

```sh
pnpm --filter @phaseo/docs translation:freshness:record --locale es --unit openapi
```

If the source revision is not checked out, add `--source-ref origin/main` after `--unit openapi`.

The initial baseline captures the source versions associated with the existing translation files. It tracks source freshness; it does not certify the translation quality or completeness of previously translated content.
