## Changesets guide

We use [Changesets](https://github.com/changesets/changesets) to version the SDK packages, the gateway API, the web UI, and now the Python SDK from one place.

### Typical workflow

1. Run `pnpm changeset` and choose which packages you want to ship plus the semver bump (`major`, `minor`, `patch`). Changesets will record your choices under `.changeset/`.
2. Review the generated Markdown summary, commit it alongside your code change, and push the branch.
3. When you are ready to publish:
   - Run `pnpm changeset:version`. That runs `changeset version`, updates every relevant `package.json`, rewrites changelog fragments, and automatically syncs `pyproject.toml` so the Python SDK follows the same version line.
   - Run `pnpm changeset publish` (or a corresponding `npm`/`pnpm` publish command) to push the releases to npm/PyPI; CI usually takes care of that from the `main` branch.
   - If you ever edit `pyproject.toml` manually, rerun `pnpm sdk-py:sync-version` before publishing to ensure it still matches the workspace version.

### Helpful flags

- `pnpm changeset status` shows what releases are queued and what versions they will become.
- `pnpm changeset` can also be run with the `--empty` flag to add a changelog entry without a version bump.
- Repeat `pnpm changeset version` if you need to adjust a bump after the initial run; just remove the old `.changeset` entry first.

### Pre-release mode

- Run `pnpm changeset pre enter <tag>` (e.g. `beta` or `next`) to mark the repo as being in pre-release state; every subsequent `pnpm changeset:version` run will produce `-tag.x` version suffixes instead of stable ones.
- Once you’re ready to ship a stable version, run `pnpm changeset pre exit` and then `pnpm changeset:version` again; the new version numbers will drop the prerelease suffix, and you can merge/publish as normal.
- Keep the generated `.changeset/pre.json` committed while you are in pre-release mode, so CI continues to know which tag to append; remove or modify it when you switch lanes.

### Other notes

- `@changesets/cli` is only installed as a dev dependency at the root; every workspace can use the shared bin via `pnpm`.
- Keep `.changeset/config.json` in sync with your release expectations (e.g., update `baseBranch` if you ever switch from `main`).
- The Mintlify docs keep their own version selector, so the version metadata in `apps/docs/docs.json` is managed independently of the gateway release cadence. Changesets does not automatically touch that file anymore.
