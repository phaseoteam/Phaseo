# PostgREST coverage

What the apps send through supabase-js, and what `@phaseo/db` translates.

- **Inventory source:** `node packages/data/db/scripts/scan-postgrest-usage.mjs --examples`, run on 2026-11-03 over the non-test code in `apps/api/src`, `apps/web-api/src`, `apps/web/src` and `apps/mobile`. It scanned 3,384 files and found 2,003 call chains: 1,662 `.from()` and 341 `.rpc()`.
- **How the scan works:** it is a heuristic scanner, not a TypeScript parser. It counts methods on the chain that follows `.from(` / `.rpc(`. It also parses select strings when they are literals or same-file constants.
- **Blind spots:**
  - Queries built in steps (`let q = …; q = q.eq(…)`) are only partly counted. A separate grep of `query = query.x(` patterns found only eq/neq/in/gte/lte/is/or/order/range/not/ilike/contains, all of them supported.
  - 48 select arguments are variables, and 14 are interpolated templates.
- **Target behaviour:** PostgREST v12.2, which is what Supabase runs. The SQL shapes, error codes and status codes follow its `QueryBuilder.hs`, `SqlFragment.hs`, `Statements.hs`, `Response.hs` and `Error.hs`.
- **Unsupported features:** if a request uses one, it gets HTTP 501 with `error.code = "PHASEO_DB_UNSUPPORTED"`, and the feature is named in `message` and `details`. Such a request never returns data.

**Result:** every feature the scan found in use is supported. Nothing is used but unsupported.

## Select

| Feature | Used | Supported | Notes / test |
|---|---|---|---|
| `*`, `select()` with no columns | 71 + 1 | yes | select.test "columns" |
| Named columns, select order kept | most | yes | |
| Alias `alias:col` | 219 | yes | |
| Cast `col::type` | 0 found | yes | Type must be a plain identifier, as in PostgREST. |
| JSON path `col->a`, `col->>a`, `->0` | 10 | yes | Without an alias, the output key is the last key, as in PostgREST. |
| Embed `rel(cols)` | 82 | yes | To-one embeds are built with `row_to_json(x.*)::jsonb`; to-many embeds with `json_agg(x)::jsonb` (`[]` when empty). Key order and spacing match PostgREST byte for byte. |
| Embed alias `alias:rel(cols)` | 64 | yes | |
| `rel!fkey_name(...)` hint (constraint) | 25 | yes | e.g. `lab:v2_labs!v2_models_lab_slug_fkey` |
| `!hint` by column / junction | 0 found | yes | PostgREST `findRel` rules, self-reference included |
| FK column as target (`users:user_id(...)`) | 2 | yes | settings.ts:1011 |
| `!inner` | 6 | yes | Root rows are filtered by `INNER JOIN LATERAL`; the count uses `EXISTS`. |
| `!left` | 0 | yes | |
| Nested embeds (depth > 1) | 2 | yes | pricing/loader.ts:78 |
| One-to-one detection (FK columns unique) | n/a | yes | |
| Many-to-many through a junction (FK columns ⊆ PK) | n/a | yes | |
| Self-referencing FK (column target = parent, table = children) | n/a | yes | |
| Ambiguous embed → PGRST201 (300); missing → PGRST200 (400) | n/a | yes | |
| Spread `...rel(cols)` | 0 | **no** → 501 | |
| Aggregates `count()`, `col.sum()` … | 0 | **no** → 501 | |
| Empty embed `rel()` | 0 | **no** → 501 | |
| Embeds through **views** (PostgREST's view-dependency relationships) | 0 found | **no** | PGRST200: metadata only holds FKs between tables. The scan found no embed whose origin or target is a view. |
| Computed relationships (functions) | 0 | **no** | PGRST200 |
| Quoted column names (`"my col"`) | 0 | **no** → 501 | The identifier allow-list rejects them. |

## Filters

| Feature | Used | Supported | Notes |
|---|---|---|---|
| `eq` / `neq` | 1,854 / 111 | yes | Values are untyped params, so Postgres infers each one from the column, as with PostgREST. |
| `gt` `gte` `lt` `lte` | 11 / 34 / 12 / 24 | yes | |
| `like` / `ilike` (`*` → `%`) | 5 / 1 | yes | |
| `is` (null/true/false/unknown) | 61 | yes | |
| `in` (quoted values with `,()`) | 354 | yes | `= ANY('{...}')`; `in.()` matches nothing |
| `contains` / `cs` (array, jsonb, string) | 3 | yes | |
| `containedBy` / `cd`, `overlaps` / `ov` | 0 | yes | |
| `textSearch` fts/plfts/phfts/wfts (+config) | 0 | yes | |
| `match()` | 0 | yes | |
| `not(col, op, v)` | 28 (in 15, is 11, like 2) | yes | |
| `filter(col, op, v)` | 0 found | yes | |
| `or()` with nested `and()`, `not.`, quoted `"…"` values, `in.(…)` | 41 (and() in 4) | yes | providers/index.ts:162 |
| `or()` on a JSON path | 1 | yes | settings-policy.ts:74 |
| `or()` / filters on an embed (`referencedTable`, `rel.col`) | 2 / 6 | yes | Embedded filters filter only the embedded rows unless `!inner` is used. |
| `not.or=` / `not.and=` | 0 | yes | |
| `rel=is.null` / `not.is.null` on an embed | 0 found | yes | |
| Quantifiers `eq(any)`, `like(all)` … | 0 | yes | |
| `isdistinct`, range ops `sl sr nxl nxr adj`, `match`/`imatch` | 0 | yes | |
| Embedded column inside a root `or()` (`or=(rel.col.eq.x)`) | 0 | **no** → 501 | |

## Modifiers

| Feature | Used | Supported | Notes |
|---|---|---|---|
| `order` asc/desc, `nullsFirst` | 311 (nullsFirst 10) | yes | |
| `order` on an embed (`referencedTable`) | 2 | yes | |
| `limit` / `range` (and on an embed) | 131 / 63 | yes | |
| `single()` | 47 | yes | PGRST116 (406) unless exactly 1 row. Mutations roll back. |
| `maybeSingle()` | 596 | yes | Handled by postgrest-js on array results. |
| `count: 'exact'` | 74 | yes | `Content-Range`, 206 for a partial page, 416/PGRST103 past the end |
| `count: 'planned' / 'estimated'` | 0 | **no** → 501 | |
| `head: true` | 51 | yes | No body; `bytes` = 0 |
| `abortSignal()` | 8 | yes | A mid-query abort rejects like `fetch`, but the statement is not cancelled on the server. |
| `stripNulls()` | 0 | yes | |
| `db-max-rows` | n/a | yes | Default 1000, applied to the root and to every embed, as in PostgREST. |
| `csv()`, `geojson()`, `explain()` | 0 | **no** → 501 | |
| `rollback()` (`Prefer: tx=rollback`) | 0 | **no** → 501 | Supabase ignores it anyway (`db-tx-end=commit`). |
| `maxAffected()` (`handling=strict`) | 0 | yes | PGRST124 + rollback |
| `Range` header | 0 | yes | |

## Mutations

| Feature | Used | Supported | Notes |
|---|---|---|---|
| `insert` single / bulk | 102 (bulk literal 6+) | yes | Uses `json_populate_record(set)(NULL::table, $1)`. In bulk rows, missing keys become NULL, as with `columns=`. |
| `Prefer: return=minimal` (no `.select()`) | most | yes | 201 / 204, empty body |
| `.select()` after a mutation (return=representation), with embeds | 175 | yes | |
| `upsert` + `onConflict`, merge-duplicates | 74 | yes | 201 on insert, 200 when every row was updated (the `pgrst.inserted` counter) |
| `upsert` `ignoreDuplicates: true` | 23 | yes | |
| `upsert` without `onConflict` | some | yes | Uses the PK from `relationships.json`; 501 if the table is not in it. |
| `update` + filters (+ `.select()`, `.single()`) | 216 | yes | |
| `delete` + filters (+ `count`) | 93 (count 3) | yes | |
| `defaultToNull: false` (`Prefer: missing=default`) | 0 | **no** → 501 | |
| `update`/`delete` with `limit`/`order` (limited mutations) | 0 | **no** → 501 | |
| `return=headers-only`, PUT | 0 | **no** → 501 / 405 | |

## RPC

| Feature | Used | Supported | Notes |
|---|---|---|---|
| `POST /rpc/fn` with named JSON args | 341 | yes | `json_to_record($1) AS _(arg type, …)` with arg types from `relationships.json` |
| No-arg functions, defaulted args | 14 | yes | |
| Overloads resolved by arg names; PGRST202 (404) / PGRST203 (300) | n/a | yes | |
| Set-returning composite: filters / select / order / limit / embeds on the result | 1 (`.select().maybeSingle()`) | yes | |
| Scalar → bare JSON value; SETOF scalar → array of values | many | yes | |
| Single composite → object; RETURNS TABLE → array | some | yes | |
| `void` → 204, `data: null` | some | yes | |
| `count` / `head` on rpc | 0 | yes | |
| `get: true` (GET rpc) | 0 | yes | Args come from query params; other params are filters. Not run READ ONLY. |
| Dynamic function names | 4 | yes | They must exist in `relationships.json`. |
| Function missing from `relationships.json` | n/a | PGRST202 + hint | Regenerate the metadata. |
| Functions returning bare `record` (no OUT params), single unnamed param, bulk array body, `Prefer: params=single-object` | 0 | **no** → 501 | |

## Requests, errors, profiles

| Feature | Supported | Notes |
|---|---|---|
| Postgres errors → `{code: SQLSTATE, message, details, hint}` | yes | PostgREST status map, e.g. 23505/23503 → 409, 42501 → 401 (anon) / 403, P0001 → 400, `PTnnn` → nnn |
| `.schema('x')` / Accept-Profile / Content-Profile | yes | Only listed `schemas` (default `public`); others → PGRST106 (406). The apps never call `.schema()`. |
| `auth` / `storage` / `functions` / `realtime` on the client | throw | "not available on the PlanetScale client" |
| Unknown column in an insert/update body | differs | Postgres returns 42703 (400). PostgREST returns PGRST204 (400). Both are 400. |
| Unknown column in select/filter | same | 42703 from Postgres, as PostgREST passes it through |
