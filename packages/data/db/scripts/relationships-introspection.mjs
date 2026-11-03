// One introspection query for @phaseo/db's static relationship metadata:
// foreign keys (pg_constraint, contype 'f'), primary/unique keys (for
// one-to-one and junction detection), table kinds, and the callable
// functions of the exposed schemas (for RPC argument typing and result
// shaping). Shared by generate-relationships.mjs and the tests.

/** Schemas whose tables and foreign keys are captured. */
export const RELATION_SCHEMAS = ["public", "private", "catalogue_private", "auth"];
/** Schemas exposed through PostgREST (Supabase's db-schemas); functions are captured for these only. */
export const RPC_SCHEMAS = ["public"];

// $1 = relation schemas (text[]), $2 = rpc schemas (text[]). Run with
// search_path = '' so format_type() schema-qualifies every non-catalog type.
export const INTROSPECTION_SQL = `
with
rels as (
  select c.oid, n.nspname as schema, c.relname as name, c.relkind as kind
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = any($1::text[]) and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
keys as (
  select con.conrelid, con.contype, con.conname,
    array(select a.attname::text from unnest(con.conkey) k(attnum)
          join pg_catalog.pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
          order by k.attnum) as cols
  from pg_catalog.pg_constraint con
  join rels r on r.oid = con.conrelid
  where con.contype in ('p', 'u')
),
fks as (
  select con.conname::text as name, n1.nspname::text as schema, c1.relname::text as "table",
    array(select a.attname::text from unnest(con.conkey, con.confkey) with ordinality u(k, fk, ord)
          join pg_catalog.pg_attribute a on a.attrelid = con.conrelid and a.attnum = u.k order by u.ord) as columns,
    n2.nspname::text as "refSchema", c2.relname::text as "refTable",
    array(select a.attname::text from unnest(con.conkey, con.confkey) with ordinality u(k, fk, ord)
          join pg_catalog.pg_attribute a on a.attrelid = con.confrelid and a.attnum = u.fk order by u.ord) as "refColumns"
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c1 on c1.oid = con.conrelid
  join pg_catalog.pg_namespace n1 on n1.oid = c1.relnamespace
  join pg_catalog.pg_class c2 on c2.oid = con.confrelid
  join pg_catalog.pg_namespace n2 on n2.oid = c2.relnamespace
  where con.contype = 'f' and con.conparentid = 0
    and n1.nspname = any($1::text[]) and n2.nspname = any($1::text[])
),
fns as (
  select n.nspname::text as schema, p.proname::text as name, p.oid,
    p.proretset as "returnsSet", p.provolatile::text as volatility,
    p.pronargs::int as nargs, p.pronargdefaults::int as ndefaults,
    p.provariadic <> 0 as variadic,
    pg_catalog.format_type(p.prorettype, null) as "returnType",
    t.typtype::text as rettyptype,
    p.prorettype = 'pg_catalog.void'::pg_catalog.regtype as returns_void,
    p.prorettype = 'pg_catalog.record'::pg_catalog.regtype as returns_record,
    coalesce('o' = any(p.proargmodes) or 't' = any(p.proargmodes), false) as has_out,
    (select rn.nspname || '.' || rc.relname from pg_catalog.pg_class rc join pg_catalog.pg_namespace rn on rn.oid = rc.relnamespace
      where rc.oid = t.typrelid and rc.relkind in ('r', 'p', 'v', 'm', 'f')) as "returnRelation",
    (select coalesce(json_agg(json_build_object('name', coalesce(a.name, ''), 'type', pg_catalog.format_type(a.typ, null), 'mode', a.mode) order by a.ord), '[]')
       from (select u.ord, u.typ, (p.proargnames)[u.ord] as name, coalesce((p.proargmodes)[u.ord]::text, 'i') as mode
             from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(typ, ord)) a
      where a.mode in ('i', 'b', 'v')) as args
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_type t on t.oid = p.prorettype
  where n.nspname = any($2::text[]) and p.prokind = 'f'
)
select json_build_object(
  'tables', (select coalesce(json_object_agg(r.schema || '.' || r.name, json_build_object(
      'kind', r.kind::text,
      'primaryKey', coalesce((select to_json(k.cols) from keys k where k.conrelid = r.oid and k.contype = 'p'), '[]'::json),
      'uniques', coalesce((select json_agg(to_json(k.cols) order by k.conname) from keys k where k.conrelid = r.oid), '[]'::json)
    ) order by r.schema, r.name), '{}'::json) from rels r),
  'foreignKeys', (select coalesce(json_agg(to_json(f) order by f.schema, f."table", f.name), '[]'::json) from fks f),
  'functions', (select coalesce(json_agg(to_json(f) order by f.schema, f.name, f.oid), '[]'::json) from fns f)
)::text as metadata
`;

/** Turn the query's JSON into the RelationshipMetadata format (src/relationships.ts). */
export function shapeMetadata(raw, { generatedAt = new Date().toISOString(), schemas = RELATION_SCHEMAS } = {}) {
	const data = typeof raw === "string" ? JSON.parse(raw) : raw;
	const functions = {};
	for (const f of data.functions) {
		if (f.rettyptype === "p" && !f.returns_void && !f.returns_record) continue; // trigger, event_trigger, internal, ...
		const inputs = f.args;
		if (inputs.some((a) => a.name === "")) continue; // unnamed parameters cannot be called with named JSON args
		const firstDefault = inputs.length - f.ndefaults;
		const returnKind = f.returns_void ? "void" : f.returns_record ? (f.has_out ? "composite" : "record") : f.rettyptype === "c" ? "composite" : "scalar";
		const entry = {
			args: inputs.map((a, i) => ({ name: a.name, type: a.type, hasDefault: i >= firstDefault, ...(a.mode === "v" ? { variadic: true } : {}) })),
			returnType: f.returnType,
			returnsSet: f.returnsSet,
			returnKind,
			returnRelation: f.returnRelation ?? null,
			volatility: f.volatility,
		};
		const key = `${f.schema}.${f.name}`;
		(functions[key] ??= []).push(entry);
	}
	return {
		version: 1,
		generatedAt,
		schemas,
		tables: data.tables,
		foreignKeys: data.foreignKeys,
		functions,
	};
}
