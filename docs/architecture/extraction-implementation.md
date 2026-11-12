# Extraction implementation

The branch implements a synchronous scalar extraction preview with its own
`extraction.extract` capability, `POST /v1/extractions` endpoint and typed IR.
Extraction and classification share the Decisions discovery family, while their
API contracts and executor selection remain separate. Existing Audio filters keep
their behavior.

## Implemented scope

- Strict requests and answers for text, number, date, time, datetime, duration and
  scalar lists. The source limit is 16,384 Unicode characters; field count is 1–64.
- Embedded PNG/JPEG/WebP images with count, base64 and decoded byte limits.
- Cloudflare native transport, error-envelope handling, response byte limits,
  aggregate input usage and zero output tokens. Model, field identity, value types,
  probability bounds, dates, integer constraints and decimal precision are checked.
- `null`, zero and empty lists stay distinct. Scalar confidence and `p_null` are
  preserved independently. Guesses and spans are omitted; `truncated` is exposed.
- Standard gateway policy, routing, credentials, pricing, audit and finalization.
  Image capability is checked before dispatch. Provider quota reservation accounts
  conservatively for repeated passes; customer pricing uses reported usage once.
- Canonical OpenAPI and generated clients for TS, Python, Go, C#, Java, PHP, Ruby,
  C++ and Rust. TS and Python sync/async clients expose `extractions.create`.
- One canonical endpoint guide with runnable SDK examples, complete translations
  in eight locales, localized OpenAPI overlays and updated documentation search.
- Decisions model filters with Classification and Extraction children, translated
  labels, an extraction vector icon and emerald-teal light/dark styling.

Forecasts, estimates, streaming, remote media retrieval, audio/video, arbitrary
nested JSON Schema and public source offsets are deliberately unsupported.

## Functional evidence

The gateway pipeline test uses the real extraction decoder, provider executor,
response encoder and client payload formatter. Provider selection/health and fetch
are deterministic test fixtures. No production authentication or inference is
claimed. The fixture sends this request through provider routing:

```json
{
  "model": "cloudflare/clairic",
  "input": "Total: $1080",
  "fields": { "total": { "type": "number" } }
}
```

Cloudflare receives `model: "clairic"`, `state: "Total: $1080"` and the typed field
map at `/ai/run/@cf/cloudflare/clairic`. The public formatter returns:

```json
{
  "model": "cloudflare/clairic",
  "answers": {
    "total": { "type": "number", "value": 1080, "confidence": 0.99, "p_null": 0.001 }
  },
  "truncated": false,
  "usage": { "input_tokens": 655, "output_tokens": 0, "total_tokens": 655 }
}
```

The pricing test verifies that 655 aggregate input tokens at $0.10 per million
cost 65,500 nanos ($0.0000655), with no multiplication by pass count and no
zero-output billing suppression. Failed responses follow the existing policy:
observed usage is retained for audit, while customer billing is suppressed.

## Validation

- `pnpm install --frozen-lockfile`: passed, lockfile unchanged.
- Focused gateway Vitest run: 10 files, 121 tests passed. Covers the extraction
  schema/executor, quota estimates, registry, endpoint metadata, execution pipeline,
  response payload, billing policy, capability mapping and protocol detection.
- `pnpm --filter @phaseo/gateway-api lint`: passed, 48 existing warnings, no errors.
- `pnpm --filter @phaseo/gateway-api typecheck`: passed.
- `pnpm --filter @phaseo/gateway-api build`: passed Worker deployment dry-run.
- `pnpm openapi:gen`: passed for all nine generated languages.
- `pnpm openapi:lint`: passed, 28 existing warnings, no errors.
- `pnpm test:sdk-ts`: 89 unit tests and 21 developer-experience tests passed.
- `pnpm test:sdk-py`: 131 passed, one skipped, one unrelated failure in
  `test_music_retrieval_uses_generated_operation_and_escapes_id` (expects `a%2Fb`
  at a mocked operation boundary but receives `a/b`). The music implementation
  and assertion are unchanged by this branch. Both extraction tests pass.
- `pnpm test:sdk-lifecycle`: passed Go, C#, Java, PHP, Ruby, Rust and C++ suites.
- `pnpm validate:packages`: passed SDK builds, offline TS package-consumer checks,
  agent SDK checks, AI SDK provider compatibility and Python wheel/sdist builds.
- `pnpm sdk:check-version-literals`: passed, including two release-sync tests.
- Focused web Jest run: four files, 51 tests passed.
- `pnpm --filter @phaseo/web typecheck`: passed after `next typegen` supplied the
  fresh worktree's generated `LayoutProps` types.
- `pnpm --filter @phaseo/web build`: passed production build.
- Scoped web ESLint: no errors, two existing warnings in ModelsDisplay.
- `pnpm --filter @phaseo/web validate:i18n`: passed.
- Docs locale coverage, OpenAPI overlay and translation freshness checks: passed
  for 615 English pages and eight translation locales.
- `node --test supabase/tests/extraction-capability.test.mjs`: passed an isolated
  PGlite execution of the changed canonical capability function.
- Browser component fixture: desktop, 390px phone, light/dark mode and horizontal
  scrolling checked. The actual filter component rendered without console errors;
  phone body had no horizontal overflow. Fixture model counts are synthetic.

The standard `pnpm docs:build` and `pnpm docs:links` commands fail on this Windows
host before Mintlify validation starts: sharp 0.35.4 reports `ERR_DLOPEN_FAILED:
The specified procedure could not be found`. A temporary loader outside the
repository redirects only Mintlify's sharp import to the already-installed
compatible sharp 0.34.5 for additional validation. No package or lockfile override
is shipped. With that temporary compatibility loader, `pnpm docs:build` passed
OpenAPI and build validation, and `pnpm docs:links` reported no broken links.

## Database and production rollout

Read-only catalogue inspection of Phaseo Prod on 2026-10-19 found Clef configured
but no `cloudflare/clairic` model. No live catalogue rows were changed.

The desired schema now recognizes `extraction.extract` in
`canonical_routing_capability_id`. The required command
`pnpm db:schema:sync -- -f add_extraction_capability` failed with:

```text
docker: command not found (podman also not found)
```

The local generator did not produce a migration or refresh dependency metadata.
Retried through the CLI on 2026-10-19 using the pinned repository command; it
failed with the same missing-container error. The installed global CLI is
2.90.0; the repository correctly invokes 2.119.0. Its declarative sync command
has no remote database URL option. WSL is present but has no installed Linux
distribution, so it does not supply an alternative container runtime.
PGlite validates the function itself; it does not replace the required declarative
schema check, full replay or migration smoke test.

Following explicit user authorization to apply through the Supabase connector,
`add_extraction_capability` was applied to Phaseo Prod as migration
`20261019193017`. The matching local forward migration contains the same function
replacement. This is a manually prepared migration, not generator output. Live
readback confirmed `extraction.extract`, preserved `decisions.make`, rejection of
unknown extraction IDs, and unchanged function permissions. The local PGlite
contract also passed. No objects or dependencies were added, so the existing
load-order manifest remains unchanged; full replay/equivalence checks still need
a container-enabled environment.

On 2026-10-19, the user requested continuation after the schema deployment.
Staged catalogue records in Phaseo Prod in one transaction across `v2_models`,
`v2_model_provider_routes`, `v2_route_capabilities`, `v2_route_variants`,
`v2_pricing_skus` and `v2_pricing_sku_meters`. Readback confirmed:

- Model `cloudflare/clairic`: preview, hidden.
- Route `cloudflare:@cf/cloudflare/clairic`: internal/testing, routing disabled;
  standard variant routing also disabled.
- Capability `extraction.extract`, text/image input and extraction output.
- Exactly one active SKU, operation `extraction.extract`, USD input-token meter,
  quantity 1,000,000 and price 100,000,000 nanos ($0.10); no output meter.

Official model documentation was fetched again before staging. No aliases or
unverified license details were added. The disabled records do not make this
worktree's executor available in the deployed gateway.

Finish rollout in this order:

1. In a Docker/Podman-enabled environment, run `db:schema:check` and
   `db:schema:smoke`, including the new SQL contract test, against the recorded
   forward migration and desired schema.
2. Review, merge and deploy the gateway/OpenAPI/SDK/web changes through the normal
   PR flow. This branch does not deploy or publish packages.
3. Already staged with targeted Supabase catalogue operations and readback:
   `cloudflare/clairic`, Cloudflare route
   `cloudflare:@cf/cloudflare/clairic`, upstream slug `@cf/cloudflare/clairic`,
   preview availability, text/image inputs and extraction output. Start disabled.
4. Already staged: only `extraction.extract`, with `images: true`, 65,536 provider context
   tokens and no output budget. Set a standard route variant and extraction SKU.
   The official input meter is `input_tokens`, unit `token`, quantity 1,000,000,
   price 100,000,000 nanos ($0.10); there is no output charge. Confirm customer
   pricing policy before activation. Source: Cloudflare model/pricing docs.
5. Confirm deployed executor support and catalogue/price resolution, then enable
   routing atomically and read back the exact model, route, capability and price.
   A paid live inference check requires explicit authorization.

Production writes comprise the authorized capability function migration and
disabled catalogue staging. No paid provider call, gateway deployment, catalogue activation,
package publication, commit or pull request was performed.
