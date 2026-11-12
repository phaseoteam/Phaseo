# Test catalog privacy policies

The internal provider fixture is test data, not a deployed provider. It requires
no API keys, upstream inference or production writes.

`src/routes/account/__fixtures__/catalog-data-policy-provider.json` contains three
models and four offers:

- Native standard: unconditional no-training, zero-retention declaration.
- Native batch: retained-content negative control, independent of standard.
- Resold standard: no training, with 30-day content retention.
- Conditional standard: requires a customer agreement and cannot grant ZDR.

## Fast local checks

Run from the repository root:

```sh
pnpm --filter @phaseo/web-api test -- src/routes/account/provider-catalog-data-policy.test.ts
node supabase/tests/catalog-data-policy.test.mjs
```

The first command validates the complete provider feed against the published JSON
schema and parser, including draft round trips. The second uses the installed
PGlite dependency to execute the real SQL policy resolver against isolated fixture
tables. Set `PGLITE_MODULE` to the module URL when using an external installation,
as the declarative CI workflow does.

Expected database behavior: unapproved native is denied; approved native is ZDR;
resold, conditional, batch and file routes remain denied; revocation, expiry,
source replacement and withdrawal remove the native guarantee; explicit
administrator pins remain authoritative. This test does not substitute for full
schema, permissions, audit or promotion replay.

## Full database integration

```sh
pnpm db:schema:check
pnpm db:schema:smoke
```

These require Docker and the generated migration. The smoke runner includes
`supabase/tests/provider_catalog_data_policy.sql`: it creates a hidden model and a
not-ready provider, calls the actual snapshot/promotion functions, reads the
effective capability policy, tests approval and withdrawal, and rolls back all
fixture records. It also checks audit history and preservation of manual pins.
Never run this fixture against production.

If Docker is unavailable locally, dispatch the existing declarative schema
workflow on the feature branch. Generation mode returns migration artifacts for
review; normal mode verifies equivalence and executes replay/smoke tests. Neither
mode needs production credentials.

## Release acceptance

Before enabling a real provider, verify the approved standard route reports ZDR
in both pricing/public and gateway projections, while resold and batch controls
remain No. Revoke approval and verify a fresh read denies immediately and managed
gateway caches stop granting within five minutes. Verify a later false or missing
declaration revokes the guarantee after sync. Browser and live gateway checks
against a migrated isolated environment remain distinct from the fixture tests.

For the real provider rollout, compare its feed IDs with the existing six manual
pins, approve the evidence, and transfer only validated pins. The separate model
discovery watcher is not the catalog import path.
