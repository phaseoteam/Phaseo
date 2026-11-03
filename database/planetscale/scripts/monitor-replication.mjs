#!/usr/bin/env node
// monitor-replication.mjs: progress and lag of a logical replication
// subscription, plus a per-table row-count comparison between source and target.
// Both connections are read-only.
//
// Forward (Supabase -> PlanetScale, CUTOVER.md phase 2):
//   SOURCE_DATABASE_URL=<supabase direct> TARGET_DATABASE_URL=<planetscale direct> \
//     node database/planetscale/scripts/monitor-replication.mjs [--counts exact] [--watch 30]
// Reverse (PlanetScale -> Supabase, phase 5 rollback): swap the URLs and pass
//   --publication replicate_to_supabase --subscription replicate_from_planetscale
//
// Flags:
//   --source <url>          publisher (default $SOURCE_DATABASE_URL, then $SUPABASE_DB_URL)
//   --target <url>          subscriber (default $TARGET_DATABASE_URL, then $PLANETSCALE_DIRECT_URL)
//   --subscription <name>   default replicate_from_supabase
//   --publication <name>    default: the subscription's first publication, else replicate_to_planetscale
//   --slot <name>           default: the subscription's slot name
//   --counts <mode>         estimate (default; pg_class.reltuples), exact (count(*) for tables whose
//                           estimate is <= --exact-max-rows), none
//   --exact-max-rows <n>    default 5000000
//   --max-lag-bytes <n>     "caught up" threshold for the slot (default 65536)
//   --watch <seconds>       repeat until interrupted
//   --check                 exit 3 unless the verdict is READY (for scripts)
//   --json
//
// READY means: subscription enabled, every table in state r (ready), slot lag
// <= --max-lag-bytes, no apply/sync errors, and (with --counts exact) equal
// counts. Counts only settle once writes on the source are paused; with live
// traffic small differences are normal.

import { parseArgs } from 'node:util';
import { connect, formatBytes, formatNumber, isMain, lsnDiff, qualified, redactUrl, renderTable, resolveUrl, rowsOf, runCli, UsageError } from './lib/common.mjs';

export const STATE_NAMES = { i: 'queued (init)', d: 'copying', f: 'copy finished', s: 'catching up (sync)', r: 'ready' };

export async function readTarget(query, subscription) {
  const [sub] = await query(
    `select s.subname, s.subenabled as enabled, s.subslotname as slot, s.subpublications as publications
       from pg_catalog.pg_subscription s
      where s.subname = $1 and s.subdbid = (select oid from pg_catalog.pg_database where datname = current_database())`,
    [subscription],
  );
  if (!sub) return { exists: false };
  const workers = await query(
    `select st.pid, st.relid::regclass::text as rel, st.received_lsn::text as received_lsn, st.latest_end_lsn::text as latest_end_lsn,
            st.last_msg_send_time, st.last_msg_receipt_time, st.latest_end_time
       from pg_catalog.pg_stat_subscription st where st.subname = $1`,
    [subscription],
  );
  const rels = await query(
    `select n.nspname as schema, c.relname as name, sr.srsubstate::text as state, sr.srsublsn::text as lsn
       from pg_catalog.pg_subscription_rel sr
       join pg_catalog.pg_subscription s on s.oid = sr.srsubid
       join pg_catalog.pg_class c on c.oid = sr.srrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where s.subname = $1 order by 1, 2`,
    [subscription],
  );
  let stats = null;
  try {
    [stats] = await query(`select apply_error_count::bigint as apply_errors, sync_error_count::bigint as sync_errors, stats_reset from pg_catalog.pg_stat_subscription_stats where subname = $1`, [subscription]);
  } catch {
    stats = null; // PG < 15
  }
  const apply = workers.find((w) => !w.rel) ?? null;
  return {
    exists: true,
    name: sub.subname,
    enabled: sub.enabled,
    slot: sub.slot,
    publications: sub.publications,
    applyWorker: apply ? { pid: apply.pid, receivedLsn: apply.received_lsn, latestEndLsn: apply.latest_end_lsn, lastMessageAt: apply.last_msg_receipt_time } : null,
    syncWorkers: workers.filter((w) => w.rel).map((w) => ({ pid: w.pid, table: w.rel })),
    tables: rels.map((r) => ({ schema: r.schema, name: r.name, state: r.state, lsn: r.lsn })),
    errors: stats ? { apply: Number(stats.apply_errors), sync: Number(stats.sync_errors), since: stats.stats_reset } : null,
  };
}

export async function readSource(query, { slot, publication }) {
  const [{ lsn }] = await query(`select pg_catalog.pg_current_wal_lsn()::text as lsn`);
  const slots = await query(
    `select slot_name, active, wal_status, confirmed_flush_lsn::text as confirmed_flush_lsn, restart_lsn::text as restart_lsn,
            pg_catalog.pg_wal_lsn_diff(pg_catalog.pg_current_wal_lsn(), restart_lsn)::bigint as retained_bytes,
            pg_catalog.pg_wal_lsn_diff(pg_catalog.pg_current_wal_lsn(), confirmed_flush_lsn)::bigint as lag_bytes,
            safe_wal_size::bigint as safe_wal_size
       from pg_catalog.pg_replication_slots
      where slot_name = $1 or (slot_name like 'pg\\_%\\_sync\\_%' and $1 is not null)
      order by slot_name`,
    [slot],
  );
  const main = slots.find((s) => s.slot_name === slot) ?? null;
  let tables = [];
  let publicationExists = false;
  if (publication) {
    const [pub] = await query(`select pubviaroot from pg_catalog.pg_publication where pubname = $1`, [publication]);
    publicationExists = Boolean(pub);
    if (pub) tables = await query(`select schemaname as schema, tablename as name from pg_catalog.pg_publication_tables where pubname = $1 order by 1, 2`, [publication]);
  }
  return {
    currentLsn: lsn,
    slot: main
      ? {
          name: main.slot_name,
          active: main.active,
          walStatus: main.wal_status,
          confirmedFlushLsn: main.confirmed_flush_lsn,
          lagBytes: main.lag_bytes === null ? null : Number(main.lag_bytes),
          retainedBytes: main.retained_bytes === null ? null : Number(main.retained_bytes),
          safeWalSize: main.safe_wal_size === null ? null : Number(main.safe_wal_size),
        }
      : null,
    syncSlots: slots.filter((s) => s.slot_name !== slot).map((s) => s.slot_name),
    publication: publication ? { name: publication, exists: publicationExists } : null,
    tables,
  };
}

/** Row estimate for a table, summing leaf partitions (pg_partition_tree returns a plain table as its own leaf). */
const ESTIMATE_SQL = `
  select coalesce(sum(greatest(c.reltuples, 0)), 0)::bigint as n
    from pg_catalog.pg_partition_tree($1::regclass) pt
    join pg_catalog.pg_class c on c.oid = pt.relid
   where pt.isleaf`;

export async function compareCounts(sourceQuery, targetQuery, tables, { mode = 'estimate', exactMaxRows = 5_000_000 } = {}) {
  const out = [];
  for (const t of tables) {
    const rel = qualified(t.schema, t.name);
    const row = { schema: t.schema, name: t.name, method: mode, source: null, target: null, diff: null, note: '' };
    try {
      const [s] = await sourceQuery(ESTIMATE_SQL, [rel]);
      row.source = Number(s.n);
    } catch (error) {
      row.note = `source: ${error.message}`;
    }
    try {
      const [g] = await targetQuery(ESTIMATE_SQL, [rel]);
      row.target = Number(g.n);
    } catch (error) {
      row.note = `target: ${error.message}`;
      out.push(row);
      continue;
    }
    if (mode === 'exact') {
      if (Math.max(row.source ?? 0, row.target ?? 0) > exactMaxRows) {
        row.method = 'estimate';
        row.note = `estimate > ${exactMaxRows}: not counted exactly`;
      } else {
        // Count both sides back to back to keep the comparison window short.
        const [[s], [g]] = await Promise.all([sourceQuery(`select count(*)::bigint as n from ${rel}`), targetQuery(`select count(*)::bigint as n from ${rel}`)]);
        row.source = Number(s.n);
        row.target = Number(g.n);
      }
    }
    if (row.source !== null && row.target !== null) row.diff = row.target - row.source;
    out.push(row);
  }
  return out;
}

export function verdict({ target, source, counts, maxLagBytes = 65_536 }) {
  const reasons = [];
  if (!target.exists) reasons.push('subscription not found on the target');
  else {
    if (!target.enabled) reasons.push('subscription is disabled');
    const notReady = target.tables.filter((t) => t.state !== 'r');
    if (!target.tables.length) reasons.push('subscription has no tables yet');
    if (notReady.length) reasons.push(`${notReady.length} table(s) not ready`);
    if (target.errors && (target.errors.apply > 0 || target.errors.sync > 0)) reasons.push(`errors since ${target.errors.since ?? 'start'}: apply ${target.errors.apply}, sync ${target.errors.sync} (check the target's logs)`);
  }
  if (!source.slot) reasons.push('replication slot not found on the source');
  else {
    if (!source.slot.active) reasons.push('replication slot is not active (no walsender connected)');
    if (source.slot.lagBytes === null || source.slot.lagBytes > maxLagBytes) reasons.push(`slot lag ${source.slot.lagBytes === null ? 'unknown' : formatBytes(source.slot.lagBytes)} > ${formatBytes(maxLagBytes)}`);
  }
  if (source.publication && !source.publication.exists) reasons.push(`publication ${source.publication.name} not found on the source`);
  if (target.exists && source.tables.length) {
    const subscribed = new Set(target.tables.map((t) => `${t.schema}.${t.name}`));
    const missing = source.tables.filter((t) => !subscribed.has(`${t.schema}.${t.name}`));
    if (missing.length) reasons.push(`${missing.length} published table(s) not in the subscription (ALTER SUBSCRIPTION ... REFRESH PUBLICATION): ${missing.slice(0, 5).map((t) => `${t.schema}.${t.name}`).join(', ')}`);
  }
  const exactMismatch = (counts ?? []).filter((c) => c.method === 'exact' && c.diff !== 0);
  if (exactMismatch.length) reasons.push(`${exactMismatch.length} table(s) with different exact counts`);
  return { ready: reasons.length === 0, reasons };
}

export function renderStatus({ target, source, counts, result, sourceLabel, targetLabel }) {
  const out = [];
  const p = (s = '') => out.push(s);
  p(`# Replication ${new Date().toISOString()}  ${sourceLabel} -> ${targetLabel}`);
  if (target.exists) {
    const states = {};
    for (const t of target.tables) states[t.state] = (states[t.state] ?? 0) + 1;
    p(`subscription ${target.name}: ${target.enabled ? 'enabled' : 'DISABLED'}, slot ${target.slot}, publications ${(target.publications ?? []).join(', ')}`);
    p(`tables: ${Object.entries(states).map(([k, v]) => `${v} ${STATE_NAMES[k] ?? k}`).join(', ') || 'none'}`);
    if (target.syncWorkers.length) p(`copying now: ${target.syncWorkers.map((w) => w.table).join(', ')}`);
    if (target.applyWorker) {
      const behind = lsnDiff(source.currentLsn, target.applyWorker.receivedLsn);
      p(`apply worker pid ${target.applyWorker.pid}: received ${target.applyWorker.receivedLsn}, source at ${source.currentLsn} (${behind === null ? '?' : formatBytes(behind)} behind), last message ${target.applyWorker.lastMessageAt ? new Date(target.applyWorker.lastMessageAt).toISOString() : 'never'}`);
    } else p('apply worker: not running');
    if (target.errors) p(`errors since ${target.errors.since ? new Date(target.errors.since).toISOString() : 'start'}: apply ${target.errors.apply}, sync ${target.errors.sync}`);
    const pending = target.tables.filter((t) => t.state !== 'r');
    if (pending.length) {
      p('not ready:');
      p(renderTable(pending.slice(0, 40).map((t) => ({ table: `${t.schema}.${t.name}`, state: STATE_NAMES[t.state] ?? t.state })), [
        { key: 'table', label: 'table' },
        { key: 'state', label: 'state' },
      ]));
    }
  } else p('subscription: NOT FOUND on the target');
  if (source.slot) {
    p(`source slot ${source.slot.name}: ${source.slot.active ? 'active' : 'INACTIVE'}, wal_status ${source.slot.walStatus}, lag ${formatBytes(source.slot.lagBytes ?? 0)}, WAL retained ${formatBytes(source.slot.retainedBytes ?? 0)}${source.slot.safeWalSize !== null ? `, safe_wal_size ${formatBytes(source.slot.safeWalSize)}` : ''}`);
  } else p('source slot: NOT FOUND');
  if (source.syncSlots.length) p(`table-sync slots on the source: ${source.syncSlots.length}`);
  if (counts?.length) {
    const differing = counts.filter((c) => c.diff !== 0);
    p();
    p(`row counts (${counts.length} tables, ${differing.length} differ):`);
    p(renderTable((differing.length ? differing : counts).slice(0, 60).map((c) => ({ table: `${c.schema}.${c.name}`, method: c.method, source: c.source === null ? '?' : formatNumber(c.source), target: c.target === null ? '?' : formatNumber(c.target), diff: c.diff === null ? '' : formatNumber(c.diff), note: c.note })), [
      { key: 'table', label: 'table' },
      { key: 'method', label: 'method' },
      { key: 'source', label: 'source', align: 'right' },
      { key: 'target', label: 'target', align: 'right' },
      { key: 'diff', label: 'diff', align: 'right' },
      { key: 'note', label: 'note' },
    ]));
  }
  p();
  p(result.ready ? 'VERDICT: READY (caught up)' : `VERDICT: NOT READY\n${result.reasons.map((r) => `  - ${r}`).join('\n')}`);
  return out.join('\n') + '\n';
}

const USAGE = `usage: node monitor-replication.mjs [--source <url>] [--target <url>] [--subscription name] [--publication name] [--slot name]
                              [--counts estimate|exact|none] [--exact-max-rows n] [--max-lag-bytes n] [--watch seconds] [--check] [--json]`;

export async function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        source: { type: 'string' },
        target: { type: 'string' },
        subscription: { type: 'string', default: 'replicate_from_supabase' },
        publication: { type: 'string' },
        slot: { type: 'string' },
        counts: { type: 'string', default: 'estimate' },
        'exact-max-rows': { type: 'string' },
        'max-lag-bytes': { type: 'string' },
        watch: { type: 'string' },
        check: { type: 'boolean', default: false },
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
  if (!['estimate', 'exact', 'none'].includes(values.counts)) throw new UsageError('--counts must be estimate, exact or none');
  const n = (name, fallback) => {
    if (values[name] === undefined) return fallback;
    const v = Number(values[name]);
    if (!Number.isFinite(v) || v < 0) throw new UsageError(`--${name} must be a non-negative number`);
    return v;
  };
  const watch = n('watch', 0);
  const sourceUrl = resolveUrl(values.source, ['SOURCE_DATABASE_URL', 'SUPABASE_DB_URL'], 'source');
  const targetUrl = resolveUrl(values.target, ['TARGET_DATABASE_URL', 'PLANETSCALE_DIRECT_URL'], 'target');
  const source = await connect(sourceUrl, { readOnly: true, applicationName: 'phaseo-monitor-replication' });
  const target = await connect(targetUrl, { readOnly: true, applicationName: 'phaseo-monitor-replication' });
  let stop = false;
  const onSignal = () => {
    stop = true;
  };
  process.once('SIGINT', onSignal);
  try {
    let last;
    do {
      const t = await readTarget(rowsOf(target), values.subscription);
      const publication = values.publication ?? t.publications?.[0] ?? 'replicate_to_planetscale';
      const slot = values.slot ?? t.slot ?? values.subscription;
      const s = await readSource(rowsOf(source), { slot, publication });
      const tableList = s.tables.length ? s.tables : t.tables ?? [];
      const counts = values.counts === 'none' ? [] : await compareCounts(rowsOf(source), rowsOf(target), tableList, { mode: values.counts, exactMaxRows: n('exact-max-rows', 5_000_000) });
      const result = verdict({ target: t, source: s, counts, maxLagBytes: n('max-lag-bytes', 65_536) });
      last = result;
      if (values.json) process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), target: t, source: s, counts, verdict: result })}\n`);
      else process.stdout.write(renderStatus({ target: t, source: s, counts, result, sourceLabel: redactUrl(sourceUrl), targetLabel: redactUrl(targetUrl) }));
      if (watch > 0 && !stop) await new Promise((resolve) => setTimeout(resolve, watch * 1000));
    } while (watch > 0 && !stop);
    return values.check && !last.ready ? 3 : 0;
  } finally {
    process.off('SIGINT', onSignal);
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

if (isMain(import.meta.url)) runCli(main, USAGE);
