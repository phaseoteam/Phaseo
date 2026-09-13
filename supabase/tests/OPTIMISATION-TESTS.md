# Optimisation regression tests

These standalone tests create synthetic tables and rows in PGlite. They require no production credentials, database snapshots, or captured query plans.

Use `@electric-sql/pglite@0.5.8` installed outside the repository and set `PGLITE_MODULE` to the file URL of its `dist/index.js`. For example, in PowerShell after installing PGlite in a temporary directory:

```powershell
$env:PGLITE_MODULE = ([System.Uri](Resolve-Path "$env:TEMP/phaseo-analytics-validation/node_modules/@electric-sql/pglite/dist/index.js").Path).AbsoluteUri
node supabase/tests/analytics-reads.test.mjs
node supabase/tests/gateway-context-access.test.mjs
node supabase/tests/platform-role-access.test.mjs
node supabase/tests/wallet-authority-access.test.mjs
```

The analytics suite checks equivalent views and rankings across date windows, token fallback, weighted latency, more than 1,000 rollups, workspace isolation, and maintenance scheduling. The access suites check denied client operations alongside preserved profile, wallet-setting, and trusted-backend operations.

`public_catalogue_payloads.sql` is a separate rollback-only equivalence check for an existing database with the catalogue RPCs installed. It is not part of the offline suite. Do not add database exports, advisor inventories, or captured plans to these tests.
