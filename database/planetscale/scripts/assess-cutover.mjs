#!/usr/bin/env node
// assess-cutover.mjs: read-only pre-flight report on the SOURCE database
// (Supabase prod) before logical replication to PlanetScale.
//
// Usage:
//   SOURCE_DATABASE_URL='postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres?sslrootcert=prod-ca-2021.crt' \
//     node database/planetscale/scripts/assess-cutover.mjs [--schemas public,private,catalogue_private] [--json]
//
// Flags:
//   --source <url>         source connection (default: $SOURCE_DATABASE_URL, then $SUPABASE_DB_URL)
//   --schemas <list>       schemas that will be replicated (default public,private,catalogue_private)
//   --deep-min-bytes <n>   measure live column bytes for tables at least this big (default 32000000)
//   --deep-max-rows <n>    ...and with at most this many estimated rows (default 100000); 0 disables
//   --cron-history-days <n> look back this far in cron.job_run_details for failures (default 35; 0 skips)
//   --json                 print the report as JSON
//
// What it reports: table sizes vs live tuples (bloat, TOAST), tables that block
// logical replication (no primary key / replica identity), sequences,
// extensions vs PlanetScale support, large objects, unlogged tables,
// materialized and foreign tables, pg_cron jobs and recent failures, wal_level,
// replication slots and publications, Supabase-only schemas and Storage use,
// and an estimated copy size.
//
// The session is read-only (default_transaction_read_only = on). The deep
// measurement sums pg_column_size() per column, which reads the heap but not
// the TOAST data. It is still a sequential scan of the heap: on Supabase prod,
// v2_request_routing_decisions (1.95 GB heap, 72 rows) takes one 1.95 GB read.
// Run it off-peak, or pass --deep-max-rows 0 to skip.
// Exit code: 0 no blockers, 2 blockers found, 64 usage error, 70 failure.

import { parseArgs } from 'node:util';
import {
  connect,
  formatBytes,
  formatNumber,
  isMain,
  qualified,
  quoteIdent,
  redactUrl,
  renderTable,
  resolveUrl,
  rowsOf,
  runCli,
  splitList,
  UsageError,
} from './lib/common.mjs';

export const DEFAULT_SCHEMAS = ['public', 'private', 'catalogue_private'];

/** Schemas Supabase manages. They are never replicated; auth is imported separately. */
export const SUPABASE_SCHEMAS = {
  auth: 'imported by database/planetscale/scripts/import-supabase-users.ts, not replicated',
  storage: 'Supabase Storage; check that no user data lives here (see storage objects below)',
  realtime: 'Supabase Realtime; not used on PlanetScale',
  _realtime: 'Supabase Realtime internals',
  vault: 'Supabase Vault; move any secret to app secrets',
  pgsodium: 'Supabase Vault internals',
  pgsodium_masks: 'Supabase Vault internals',
  graphql: 'pg_graphql; not used',
  graphql_public: 'pg_graphql; not used',
  supabase_functions: 'Supabase database webhooks',
  supabase_migrations: 'Supabase CLI migration history',
  net: 'pg_net; replaced by the Better Auth user-create hook',
  cron: 'pg_cron; jobs are re-created by migrations/0003_cron.sql',
  pgbouncer: 'Supabase pooler auth function',
  extensions: 'extension objects; re-created by migrations/0000_platform.sql',
  _analytics: 'Supabase Logflare',
};

/**
 * PlanetScale Postgres extension support, from
 * https://planetscale.com/docs/postgres/extensions (checked 2026-11-03).
 * Anything not listed here is reported as "unknown: check the docs".
 */
export const PLANETSCALE_EXTENSIONS = {
  plpgsql: { status: 'builtin' },
  pgcrypto: { status: 'create', note: 'CREATE EXTENSION (0000)' },
  pg_trgm: { status: 'create', note: 'CREATE EXTENSION (0000)' },
  citext: { status: 'create', note: 'CREATE EXTENSION' },
  'uuid-ossp': { status: 'create', note: 'CREATE EXTENSION (0000)' },
  moddatetime: { status: 'create', note: 'CREATE EXTENSION as the default (near-superuser) role (0000)' },
  hypopg: { status: 'preinstalled', note: 'installed by default; 0000 moves it to schema extensions' },
  pg_stat_statements: { status: 'dashboard', note: 'enable in Clusters > Extensions (restart), then 0000' },
  pg_cron: { status: 'dashboard', note: 'enable in Clusters > Extensions (restart), then 0003' },
  pg_net: { status: 'unsupported', note: 'not offered; Discord signup webhook moved to Better Auth hook', handled: true },
  index_advisor: { status: 'unsupported', note: 'not offered; nothing calls it (use Insights + hypopg)', handled: true },
  supabase_vault: { status: 'unsupported', note: 'Supabase-only; not used by the schema', handled: true },
  pgsodium: { status: 'unsupported', note: 'Supabase-only', handled: true },
  pg_graphql: { status: 'unsupported', note: 'Supabase-only; not used', handled: true },
  pgjwt: { status: 'unsupported', note: 'Supabase-only; check nothing calls it', handled: false },
};

function num(value) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

// ---------------------------------------------------------------------------
// Collect

export async function collectReport(query, options = {}) {
  const schemas = options.schemas?.length ? options.schemas : DEFAULT_SCHEMAS;
  const deepMinBytes = options.deepMinBytes ?? 32_000_000;
  const deepMaxRows = options.deepMaxRows ?? 100_000;
  const cronHistoryDays = options.cronHistoryDays ?? 35;
  const warnings = [];
  const blockers = [];

  // Server and database ------------------------------------------------------
  const settingsRows = await query(
    `select name, setting from pg_catalog.pg_settings
      where name = any($1::text[])`,
    [['server_version', 'wal_level', 'max_replication_slots', 'max_wal_senders', 'max_logical_replication_workers', 'TimeZone', 'server_encoding', 'max_slot_wal_keep_size', 'statement_timeout']],
  );
  const settings = Object.fromEntries(settingsRows.map((r) => [r.name, r.setting]));
  const [db] = await query(
    `select d.datname, pg_catalog.pg_database_size(d.oid)::bigint as size_bytes,
            to_jsonb(d) - 'datacl' - 'datfrozenxid' - 'datminmxid' as raw
       from pg_catalog.pg_database d where d.datname = current_database()`,
  );
  const raw = db.raw ?? {};
  const database = {
    name: db.datname,
    sizeBytes: num(db.size_bytes),
    collate: raw.datcollate ?? null,
    ctype: raw.datctype ?? null,
    localeProvider: { c: 'libc', i: 'icu', b: 'builtin' }[raw.datlocprovider] ?? raw.datlocprovider ?? null,
    icuLocale: raw.datlocale ?? raw.daticulocale ?? null,
  };
  const [role] = await query(
    `select r.rolname, r.rolsuper, r.rolreplication, r.rolbypassrls,
            (select s.setconfig from pg_catalog.pg_db_role_setting s where s.setrole = r.oid and s.setdatabase = 0) as role_config
       from pg_catalog.pg_roles r where r.rolname = current_user`,
  );
  const roleTimeout = (role.role_config ?? []).find((c) => c.startsWith('statement_timeout='));
  if (settings.wal_level !== 'logical') blockers.push(`wal_level is ${settings.wal_level}; logical replication needs wal_level = logical`);
  if (roleTimeout && !/=0$/.test(roleTimeout)) {
    warnings.push(`role ${role.rolname} has ${roleTimeout}; set it to 0 for the replication role (PlanetScale's Supabase guide), or table copies can fail and pile up WAL`);
  }
  if (!role.rolreplication && !role.rolsuper) {
    warnings.push(`role ${role.rolname} has no REPLICATION attribute; the subscription must connect as a role that has it (Supabase's postgres role does)`);
  }

  // Tables ---------------------------------------------------------------------
  const tableRows = await query(
    `select n.nspname as schema, c.relname as name, c.oid::bigint as oid, c.relkind::text as relkind,
            c.relpersistence::text as persistence, c.relispartition as is_partition,
            c.relreplident::text as replident,
            greatest(c.reltuples, 0)::bigint as est_rows,
            coalesce(s.n_live_tup, 0)::bigint as live_tup,
            coalesce(s.n_dead_tup, 0)::bigint as dead_tup,
            pg_catalog.pg_relation_size(c.oid)::bigint as heap_bytes,
            case when c.reltoastrelid = 0 then 0 else pg_catalog.pg_total_relation_size(c.reltoastrelid) end::bigint as toast_bytes,
            pg_catalog.pg_indexes_size(c.oid)::bigint as index_bytes,
            pg_catalog.pg_total_relation_size(c.oid)::bigint as total_bytes,
            exists (select 1 from pg_catalog.pg_index i where i.indrelid = c.oid and i.indisprimary) as has_pk,
            (select ic.relname from pg_catalog.pg_index i join pg_catalog.pg_class ic on ic.oid = i.indexrelid
              where i.indrelid = c.oid and i.indisreplident limit 1) as replident_index,
            greatest(s.last_vacuum, s.last_autovacuum) as last_vacuum
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       left join pg_catalog.pg_stat_all_tables s on s.relid = c.oid
      where c.relkind in ('r', 'p', 'f') and n.nspname = any($1::text[])
      order by pg_catalog.pg_total_relation_size(c.oid) desc, n.nspname, c.relname`,
    [schemas],
  );
  const uniqueRows = await query(
    `select i.indrelid::bigint as oid, ic.relname as index_name, bool_and(a.attnotnull) as all_not_null
       from pg_catalog.pg_index i
       join pg_catalog.pg_class ic on ic.oid = i.indexrelid
       join pg_catalog.pg_class t on t.oid = i.indrelid
       join pg_catalog.pg_namespace n on n.oid = t.relnamespace
       join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indisunique and i.indimmediate and i.indisvalid and not i.indisprimary
        and i.indpred is null and i.indexprs is null and n.nspname = any($1::text[])
      group by i.indrelid, ic.relname`,
    [schemas],
  );
  const uniqueByOid = new Map();
  for (const u of uniqueRows) if (u.all_not_null && !uniqueByOid.has(String(u.oid))) uniqueByOid.set(String(u.oid), u.index_name);

  const tables = [];
  for (const t of tableRows) {
    const table = {
      schema: t.schema,
      name: t.name,
      kind: t.relkind === 'p' ? 'partitioned' : t.relkind === 'f' ? 'foreign' : t.is_partition ? 'partition' : 'table',
      unlogged: t.persistence === 'u',
      replicaIdentity: { d: 'default', n: 'nothing', f: 'full', i: 'index' }[t.replident] ?? t.replident,
      hasPrimaryKey: t.has_pk,
      replicaIdentityIndex: t.replident_index,
      estRows: num(t.est_rows),
      liveTuples: num(t.live_tup),
      deadTuples: num(t.dead_tup),
      heapBytes: num(t.heap_bytes),
      toastBytes: num(t.toast_bytes),
      indexBytes: num(t.index_bytes),
      totalBytes: num(t.total_bytes),
      lastVacuum: t.last_vacuum ? new Date(t.last_vacuum).toISOString() : null,
      live: null,
    };
    // Usable replica identity for UPDATE/DELETE once the table is published.
    const ri = table.replicaIdentity;
    table.replicationReady =
      table.kind === 'foreign' ||
      ri === 'full' ||
      (ri === 'default' && table.hasPrimaryKey) ||
      (ri === 'index' && Boolean(table.replicaIdentityIndex));
    if (!table.replicationReady) table.uniqueIndexCandidate = uniqueByOid.get(String(t.oid)) ?? null;
    tables.push(table);
  }

  // Role-level settings the apps rely on (statement_timeout, safeupdate). On PlanetScale they
  // must be re-created by hand: SET ROLE does not apply the target role's settings.
  const roleSettings = (
    await query(
      `select r.rolname as role, d.datname as database, s.setconfig as config
         from pg_catalog.pg_db_role_setting s
         join pg_catalog.pg_roles r on r.oid = s.setrole
         left join pg_catalog.pg_database d on d.oid = s.setdatabase
        where r.rolname = any($1::text[]) order by 1`,
      [['anon', 'authenticated', 'service_role', 'authenticator', 'postgres', role.rolname]],
    )
  ).map((r) => ({ role: r.role, database: r.database ?? null, config: r.config ?? [] }));

  // Deep live-size measurement for large, few-row tables (heap or TOAST bloat check).
  if (deepMaxRows > 0) {
    for (const table of tables) {
      if (table.kind !== 'table' && table.kind !== 'partition') continue;
      const rows = Math.max(table.estRows, table.liveTuples);
      if (table.totalBytes < deepMinBytes || rows > deepMaxRows) continue;
      const columns = await query(
        `select a.attname from pg_catalog.pg_attribute a
          where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum`,
        [qualified(table.schema, table.name)],
      );
      const sums = columns.map((c) => `coalesce(sum(pg_catalog.pg_column_size(t.${quoteIdent(c.attname)})), 0)`).join(' + ') || '0';
      const [measured] = await query(`select count(*)::bigint as rows, (${sums})::bigint as column_bytes from ${qualified(table.schema, table.name)} t`);
      const liveRows = num(measured.rows);
      // 24-byte tuple header + 4-byte line pointer per row, roughly.
      const liveBytes = num(measured.column_bytes) + liveRows * 28;
      table.live = { rows: liveRows, bytes: liveBytes };
    }
  }

  for (const table of tables) {
    if (table.kind !== 'table' && table.kind !== 'partition') continue;
    const onDisk = table.heapBytes + table.toastBytes;
    if (table.live) {
      table.bloatRatio = table.live.bytes > 0 ? onDisk / table.live.bytes : null;
      table.estimatedCopyBytes = table.live.bytes;
    } else {
      const liveShare = table.liveTuples + table.deadTuples > 0 ? table.liveTuples / (table.liveTuples + table.deadTuples) : 1;
      table.bloatRatio = null;
      table.estimatedCopyBytes = Math.round(table.heapBytes * liveShare) + table.toastBytes;
    }
    // Stats can be reset (n_live_tup 0) while reltuples still holds the last ANALYZE estimate.
    const rows = table.live?.rows ?? Math.max(table.liveTuples, table.estRows);
    table.bytesPerRow = rows > 0 ? Math.round(onDisk / rows) : null;
    table.suspectBloat = (table.bloatRatio !== null && table.bloatRatio >= 3 && onDisk >= deepMinBytes) || (table.live === null && table.bytesPerRow !== null && table.bytesPerRow > 256_000 && onDisk >= deepMinBytes);
    const onDiskWithToast = onDisk || 1;
    table.estimatedTargetIndexBytes = Math.round(table.indexBytes * Math.min(1, table.estimatedCopyBytes / onDiskWithToast));
  }

  const leaf = tables.filter((t) => t.kind === 'table' || t.kind === 'partition');
  const notReady = tables.filter((t) => !t.replicationReady);
  for (const t of notReady) {
    blockers.push(
      `${t.schema}.${t.name} has no usable replica identity (replica identity ${t.replicaIdentity}, ${t.hasPrimaryKey ? 'has' : 'no'} primary key): once it is in the publication, UPDATE and DELETE on it FAIL on the source. ${
        t.uniqueIndexCandidate ? `Fix: ALTER TABLE ... REPLICA IDENTITY USING INDEX ${t.uniqueIndexCandidate}` : 'Fix: add a primary key, or REPLICA IDENTITY FULL'
      } (as a migration on main), or leave it out of the publication and copy it at cutover.`,
    );
  }
  const unlogged = leaf.filter((t) => t.unlogged);
  for (const t of unlogged) blockers.push(`${t.schema}.${t.name} is UNLOGGED: logical replication does not carry it. Copy it at cutover or make it logged.`);
  const foreign = tables.filter((t) => t.kind === 'foreign');
  for (const t of foreign) warnings.push(`${t.schema}.${t.name} is a foreign table: not replicated, and postgres_fdw availability on PlanetScale is unverified.`);

  // Materialized views ----------------------------------------------------------
  const matviews = (
    await query(
      `select n.nspname as schema, c.relname as name, pg_catalog.pg_total_relation_size(c.oid)::bigint as total_bytes, c.relispopulated as populated
         from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'm' and n.nspname = any($1::text[]) order by 1, 2`,
      [schemas],
    )
  ).map((m) => ({ schema: m.schema, name: m.name, totalBytes: num(m.total_bytes), populated: m.populated }));
  for (const m of matviews) warnings.push(`materialized view ${m.schema}.${m.name} is not replicated: REFRESH it on the target after the copy.`);

  // Sequences -------------------------------------------------------------------
  const sequences = (
    await query(
      `select s.schemaname as schema, s.sequencename as name, s.data_type::text as data_type, s.last_value::text as last_value,
              s.increment_by::text as increment_by, s.max_value::text as max_value,
              pg_catalog.has_sequence_privilege(pg_catalog.format('%I.%I', s.schemaname, s.sequencename), 'SELECT') as readable,
              o.owned_by
         from pg_catalog.pg_sequences s
         left join lateral (
           select d.refobjid::regclass::text || '.' || a.attname as owned_by
             from pg_catalog.pg_depend d
             join pg_catalog.pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
            where d.classid = 'pg_catalog.pg_class'::regclass and d.refclassid = 'pg_catalog.pg_class'::regclass
              and d.objid = pg_catalog.format('%I.%I', s.schemaname, s.sequencename)::regclass
              and d.deptype in ('a', 'i')
            limit 1) o on true
        where s.schemaname = any($1::text[])
        order by 1, 2`,
      [schemas],
    )
  ).map((s) => ({
    schema: s.schema,
    name: s.name,
    dataType: s.data_type,
    lastValue: s.last_value,
    incrementBy: s.increment_by,
    maxValue: s.max_value,
    readable: s.readable,
    ownedBy: s.owned_by,
  }));
  const unreadable = sequences.filter((s) => !s.readable);
  if (unreadable.length) warnings.push(`${unreadable.length} sequence(s) are not readable by ${role.rolname}; sync-sequences.mjs cannot copy them: ${unreadable.map((s) => `${s.schema}.${s.name}`).join(', ')}`);

  // Extensions ------------------------------------------------------------------
  const extensions = (await query(`select e.extname as name, e.extversion as version, n.nspname as schema from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace order by 1`)).map((e) => {
    const support = PLANETSCALE_EXTENSIONS[e.name];
    return { name: e.name, version: e.version, schema: e.schema, planetscale: support?.status ?? 'unknown', note: support?.note ?? 'not in the checked list: see https://planetscale.com/docs/postgres/extensions' };
  });
  for (const e of extensions) {
    const support = PLANETSCALE_EXTENSIONS[e.name];
    if (!support) warnings.push(`extension ${e.name} ${e.version} (schema ${e.schema}) is not in the checked PlanetScale list; confirm support or that nothing uses it`);
    else if (support.status === 'unsupported' && !support.handled) warnings.push(`extension ${e.name} is not offered by PlanetScale: ${support.note}`);
  }

  // Large objects ---------------------------------------------------------------
  const [lo] = await query(`select count(*)::bigint as n from pg_catalog.pg_largeobject_metadata`);
  const largeObjects = num(lo.n);
  if (largeObjects > 0) blockers.push(`${largeObjects} large object(s) exist: logical replication does not carry pg_largeobject. Find their owners and move them before cutover.`);

  // Schemas outside the copy scope ----------------------------------------------
  const schemaRows = await query(
    `select n.nspname as schema,
            count(c.oid) filter (where c.relkind in ('r', 'p'))::bigint as tables,
            coalesce(sum(pg_catalog.pg_total_relation_size(c.oid)) filter (where c.relkind in ('r', 'm')), 0)::bigint as total_bytes
       from pg_catalog.pg_namespace n
       left join pg_catalog.pg_class c on c.relnamespace = n.oid
      where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') and n.nspname not like 'pg_temp_%' and n.nspname not like 'pg_toast_temp_%'
      group by n.nspname order by 3 desc`,
  );
  const otherSchemas = schemaRows
    .filter((s) => !schemas.includes(s.schema))
    .map((s) => ({ schema: s.schema, tables: num(s.tables), totalBytes: num(s.total_bytes), handling: SUPABASE_SCHEMAS[s.schema] ?? null }));
  for (const s of otherSchemas) {
    if (!s.handling && s.tables > 0) warnings.push(`schema ${s.schema} has ${s.tables} table(s) (${formatBytes(s.totalBytes)}) and is neither copied nor a known Supabase schema`);
  }

  // Supabase Storage use --------------------------------------------------------
  let storage = null;
  const [hasStorage] = await query(`select to_regclass('storage.objects') is not null as present`);
  if (hasStorage.present) {
    try {
      storage = (
        await query(
          `select bucket_id, count(*)::bigint as objects, coalesce(sum((metadata->>'size')::bigint), 0)::bigint as bytes
             from storage.objects group by bucket_id order by 2 desc`,
        )
      ).map((b) => ({ bucket: b.bucket_id, objects: num(b.objects), bytes: num(b.bytes) }));
      if (storage.some((b) => b.objects > 0)) warnings.push(`Supabase Storage holds ${storage.reduce((a, b) => a + b.objects, 0)} object(s); they do not move with the database. Decide where they go before decommissioning Supabase.`);
    } catch (error) {
      storage = { error: error.message };
    }
  }

  // pg_cron -----------------------------------------------------------------------
  let cron = null;
  const [hasCron] = await query(`select to_regclass('cron.job') is not null as present`);
  if (hasCron.present) {
    const jobs = await query(`select jobid::bigint as jobid, jobname, schedule, command, database, username, active from cron.job order by jobname`);
    let history = [];
    if (cronHistoryDays > 0) {
      try {
        history = await query(
          `select d.jobid::bigint as jobid, count(*)::bigint as runs,
                  count(*) filter (where d.status = 'failed')::bigint as failed,
                  max(d.start_time) filter (where d.status = 'failed') as last_failed,
                  (array_agg(d.return_message order by d.start_time desc) filter (where d.status = 'failed'))[1] as last_error
             from cron.job_run_details d
            where d.start_time > now() - make_interval(days => $1::int)
            group by d.jobid`,
          [cronHistoryDays],
        );
      } catch (error) {
        warnings.push(`cron.job_run_details not readable: ${error.message}`);
      }
    }
    const byJob = new Map(history.map((h) => [String(h.jobid), h]));
    cron = jobs.map((j) => {
      const h = byJob.get(String(j.jobid));
      return {
        jobname: j.jobname,
        schedule: j.schedule,
        command: j.command,
        database: j.database,
        username: j.username,
        active: j.active,
        runs: h ? num(h.runs) : 0,
        failed: h ? num(h.failed) : 0,
        lastFailed: h?.last_failed ? new Date(h.last_failed).toISOString() : null,
        lastError: h?.last_error ?? null,
      };
    });
    for (const j of cron) if (j.active && j.failed > 0) warnings.push(`cron job ${j.jobname} failed ${j.failed} of ${j.runs} run(s) in ${cronHistoryDays} days: ${(j.lastError ?? '').slice(0, 160)}`);
  }

  // Replication slots and publications -------------------------------------------
  const slots = (
    await query(
      `select slot_name, plugin, slot_type, database, active, wal_status,
              pg_catalog.pg_wal_lsn_diff(pg_catalog.pg_current_wal_lsn(), restart_lsn)::bigint as retained_bytes
         from pg_catalog.pg_replication_slots order by slot_name`,
    )
  ).map((s) => ({ name: s.slot_name, plugin: s.plugin, type: s.slot_type, database: s.database, active: s.active, walStatus: s.wal_status, retainedBytes: s.retained_bytes === null ? null : num(s.retained_bytes) }));
  for (const s of slots) if (!s.active && s.retainedBytes && s.retainedBytes > 1e9) warnings.push(`inactive replication slot ${s.name} retains ${formatBytes(s.retainedBytes)} of WAL`);
  const publications = await query(`select pubname as name, puballtables as all_tables, pubviaroot as via_root from pg_catalog.pg_publication order by 1`);

  // Totals ---------------------------------------------------------------------------
  const sum = (list, key) => list.reduce((acc, t) => acc + (t[key] ?? 0), 0);
  const totals = {
    tables: leaf.length,
    partitionedParents: tables.filter((t) => t.kind === 'partitioned').length,
    onDiskBytes: sum(leaf, 'totalBytes'),
    heapAndToastBytes: leaf.reduce((acc, t) => acc + t.heapBytes + t.toastBytes, 0),
    indexBytes: sum(leaf, 'indexBytes'),
    estimatedCopyBytes: sum(leaf, 'estimatedCopyBytes'),
    estimatedTargetIndexBytes: sum(leaf, 'estimatedTargetIndexBytes'),
  };
  totals.estimatedTargetBytes = totals.estimatedCopyBytes + totals.estimatedTargetIndexBytes;

  return {
    generatedAt: new Date().toISOString(),
    schemas,
    settings,
    database,
    roleSettings,
    role: { name: role.rolname, superuser: role.rolsuper, replication: role.rolreplication, bypassRls: role.rolbypassrls, statementTimeout: roleTimeout ?? null },
    tables,
    matviews,
    sequences,
    extensions,
    largeObjects,
    otherSchemas,
    storage,
    cron,
    slots,
    publications,
    totals,
    blockers,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Render

export function renderReport(report, { top = 25 } = {}) {
  const out = [];
  const p = (s = '') => out.push(s);
  const d = report.database;
  p(`# Cutover assessment (${report.generatedAt})`);
  p();
  p(`Database ${d.name}: ${formatBytes(d.sizeBytes)} on disk, PostgreSQL ${report.settings.server_version}, encoding ${report.settings.server_encoding}, TimeZone ${report.settings.TimeZone}`);
  p(`Collation: provider ${d.localeProvider}, collate ${d.collate}${d.icuLocale ? `, ICU locale ${d.icuLocale}` : ''} (compare with the PlanetScale database; see CUTOVER.md decision D8)`);
  p(`wal_level ${report.settings.wal_level}, max_replication_slots ${report.settings.max_replication_slots}, max_wal_senders ${report.settings.max_wal_senders}, max_slot_wal_keep_size ${report.settings.max_slot_wal_keep_size}`);
  p(`Connected as ${report.role.name} (replication ${report.role.replication}, superuser ${report.role.superuser}${report.role.statementTimeout ? `, ${report.role.statementTimeout}` : ''})`);
  p(`Schemas copied: ${report.schemas.join(', ')}`);
  for (const r of report.roleSettings ?? []) p(`Role setting: ${r.role}${r.database ? ` in ${r.database}` : ''}: ${r.config.join(', ')}`);
  p();

  const t = report.totals;
  p('## Size');
  p(`  ${t.tables} tables/partitions (+${t.partitionedParents} partitioned parents)`);
  p(`  on disk: ${formatBytes(t.onDiskBytes)} (heap+TOAST ${formatBytes(t.heapAndToastBytes)}, indexes ${formatBytes(t.indexBytes)})`);
  p(`  estimated copy (live data): ${formatBytes(t.estimatedCopyBytes)}; with rebuilt indexes about ${formatBytes(t.estimatedTargetBytes)} (upper bound; TOAST bloat is only removed for deep-measured tables)`);
  p();

  p(`## Largest tables (top ${top})`);
  const largest = report.tables.filter((x) => x.kind !== 'partitioned').slice(0, top);
  p(
    renderTable(
      largest.map((x) => ({
        table: `${x.schema}.${x.name}`,
        total: formatBytes(x.totalBytes),
        heap: formatBytes(x.heapBytes),
        toast: formatBytes(x.toastBytes),
        idx: formatBytes(x.indexBytes),
        rows: formatNumber(x.live?.rows ?? Math.max(x.liveTuples, x.estRows)),
        dead: formatNumber(x.deadTuples),
        live: x.live ? formatBytes(x.live.bytes) : '',
        bloat: x.bloatRatio ? `${x.bloatRatio.toFixed(1)}x` : '',
        flag: x.suspectBloat ? 'BLOAT?' : '',
      })),
      [
        { key: 'table', label: 'table' },
        { key: 'total', label: 'total', align: 'right' },
        { key: 'heap', label: 'heap', align: 'right' },
        { key: 'toast', label: 'toast', align: 'right' },
        { key: 'idx', label: 'indexes', align: 'right' },
        { key: 'rows', label: 'live rows', align: 'right' },
        { key: 'dead', label: 'dead', align: 'right' },
        { key: 'live', label: 'live bytes', align: 'right' },
        { key: 'bloat', label: 'disk/live', align: 'right' },
        { key: 'flag', label: '' },
      ],
    ),
  );
  p('  "live bytes" is measured (sum of pg_column_size per column) for tables over the deep-size threshold with few rows.');
  p('  disk/live >= 3 means the copy will be much smaller than the source; VACUUM FULL is not needed for the copy.');
  p();

  const notReady = report.tables.filter((x) => !x.replicationReady);
  p('## Logical replication blockers: tables without a usable replica identity');
  p(renderTable(notReady.map((x) => ({ table: `${x.schema}.${x.name}`, kind: x.kind, ri: x.replicaIdentity, pk: x.hasPrimaryKey ? 'yes' : 'no', fix: x.uniqueIndexCandidate ? `USING INDEX ${x.uniqueIndexCandidate}` : 'add PK or FULL' })), [
    { key: 'table', label: 'table' },
    { key: 'kind', label: 'kind' },
    { key: 'ri', label: 'replica identity' },
    { key: 'pk', label: 'pk' },
    { key: 'fix', label: 'suggested fix' },
  ]));
  const full = report.tables.filter((x) => x.replicaIdentity === 'full');
  if (full.length) p(`  REPLICA IDENTITY FULL (works, but every UPDATE/DELETE ships the whole old row): ${full.map((x) => `${x.schema}.${x.name}`).join(', ')}\n`);

  p('## Unlogged, foreign tables and materialized views (not replicated)');
  const special = [
    ...report.tables.filter((x) => x.unlogged).map((x) => ({ object: `${x.schema}.${x.name}`, kind: 'unlogged table', size: formatBytes(x.totalBytes) })),
    ...report.tables.filter((x) => x.kind === 'foreign').map((x) => ({ object: `${x.schema}.${x.name}`, kind: 'foreign table', size: '' })),
    ...report.matviews.map((m) => ({ object: `${m.schema}.${m.name}`, kind: 'materialized view', size: formatBytes(m.totalBytes) })),
  ];
  p(renderTable(special, [
    { key: 'object', label: 'object' },
    { key: 'kind', label: 'kind' },
    { key: 'size', label: 'size', align: 'right' },
  ]));
  p(`Large objects: ${formatNumber(report.largeObjects)}`);
  p();

  p(`## Sequences (${report.sequences.length}; not replicated, run sync-sequences.mjs at cutover)`);
  p(renderTable(report.sequences.map((s) => ({ seq: `${s.schema}.${s.name}`, type: s.dataType, last: s.lastValue ?? (s.readable ? '(unused)' : '(no privilege)'), owned: s.ownedBy ?? '' })), [
    { key: 'seq', label: 'sequence' },
    { key: 'type', label: 'type' },
    { key: 'last', label: 'last_value', align: 'right' },
    { key: 'owned', label: 'owned by' },
  ]));

  p('## Extensions vs PlanetScale');
  p(renderTable(report.extensions.map((e) => ({ ext: e.name, ver: e.version, schema: e.schema, ps: e.planetscale, note: e.note })), [
    { key: 'ext', label: 'extension' },
    { key: 'ver', label: 'version' },
    { key: 'schema', label: 'schema' },
    { key: 'ps', label: 'planetscale' },
    { key: 'note', label: 'note' },
  ]));

  p('## Schemas not copied');
  p(renderTable(report.otherSchemas.map((s) => ({ schema: s.schema, tables: s.tables, size: formatBytes(s.totalBytes), handling: s.handling ?? 'UNKNOWN: decide' })), [
    { key: 'schema', label: 'schema' },
    { key: 'tables', label: 'tables', align: 'right' },
    { key: 'size', label: 'size', align: 'right' },
    { key: 'handling', label: 'handling' },
  ]));
  if (Array.isArray(report.storage)) {
    p('Supabase Storage buckets:');
    p(renderTable(report.storage.map((b) => ({ bucket: b.bucket, objects: formatNumber(b.objects), size: formatBytes(b.bytes) })), [
      { key: 'bucket', label: 'bucket' },
      { key: 'objects', label: 'objects', align: 'right' },
      { key: 'size', label: 'size', align: 'right' },
    ]));
  }

  if (report.cron) {
    p('## pg_cron jobs');
    p(renderTable(report.cron.map((j) => ({ job: j.jobname, schedule: j.schedule, active: j.active ? 'yes' : 'no', db: j.database, user: j.username, runs: j.runs, failed: j.failed })), [
      { key: 'job', label: 'job' },
      { key: 'schedule', label: 'schedule' },
      { key: 'active', label: 'active' },
      { key: 'db', label: 'database' },
      { key: 'user', label: 'user' },
      { key: 'runs', label: 'runs', align: 'right' },
      { key: 'failed', label: 'failed', align: 'right' },
    ]));
  }

  p('## Replication slots and publications on the source');
  p(renderTable(report.slots.map((s) => ({ slot: s.name, plugin: s.plugin ?? '', type: s.type, active: s.active ? 'yes' : 'no', wal: s.walStatus ?? '', retained: s.retainedBytes === null ? '' : formatBytes(s.retainedBytes) })), [
    { key: 'slot', label: 'slot' },
    { key: 'plugin', label: 'plugin' },
    { key: 'type', label: 'type' },
    { key: 'active', label: 'active' },
    { key: 'wal', label: 'wal_status' },
    { key: 'retained', label: 'WAL retained', align: 'right' },
  ]));
  p(renderTable(report.publications.map((x) => ({ pub: x.name, all: x.all_tables ? 'yes' : 'no', root: x.via_root ? 'yes' : 'no' })), [
    { key: 'pub', label: 'publication' },
    { key: 'all', label: 'all tables' },
    { key: 'root', label: 'via root' },
  ]));

  p(`## Blockers (${report.blockers.length})`);
  for (const b of report.blockers) p(`  - ${b}`);
  if (!report.blockers.length) p('  none');
  p();
  p(`## Warnings (${report.warnings.length})`);
  for (const w of report.warnings) p(`  - ${w}`);
  if (!report.warnings.length) p('  none');
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI

const USAGE = `usage: node assess-cutover.mjs [--source <url>] [--schemas a,b] [--deep-min-bytes n] [--deep-max-rows n] [--cron-history-days n] [--json]
  source defaults to $SOURCE_DATABASE_URL, then $SUPABASE_DB_URL (Supabase DIRECT connection, port 5432)`;

export async function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        source: { type: 'string' },
        schemas: { type: 'string' },
        'deep-min-bytes': { type: 'string' },
        'deep-max-rows': { type: 'string' },
        'cron-history-days': { type: 'string' },
        top: { type: 'string' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    throw new UsageError(error.message);
  }
  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const url = resolveUrl(values.source, ['SOURCE_DATABASE_URL', 'SUPABASE_DB_URL'], 'source');
  const intFlag = (name, fallback) => {
    if (values[name] === undefined) return fallback;
    const n = Number(values[name]);
    if (!Number.isFinite(n) || n < 0) throw new UsageError(`--${name} must be a non-negative number`);
    return n;
  };
  const client = await connect(url, { readOnly: true, applicationName: 'phaseo-assess-cutover', statementTimeoutMs: 300_000 });
  try {
    process.stderr.write(`assessing ${redactUrl(url)} (read-only)\n`);
    const report = await collectReport(rowsOf(client), {
      schemas: splitList(values.schemas),
      deepMinBytes: intFlag('deep-min-bytes', 32_000_000),
      deepMaxRows: intFlag('deep-max-rows', 100_000),
      cronHistoryDays: intFlag('cron-history-days', 35),
    });
    process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report, { top: intFlag('top', 25) }));
    return report.blockers.length ? 2 : 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (isMain(import.meta.url)) runCli(main, USAGE);
