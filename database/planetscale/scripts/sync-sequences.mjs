#!/usr/bin/env node
// sync-sequences.mjs: copy sequence positions from SOURCE to TARGET, plus a
// safety margin. Logical replication does not carry sequence values, so run
// this at cutover, after writes on the source have stopped and replication has
// caught up (CUTOVER.md phase 4), and again in the reverse direction when
// rolling back (phase 5).
//
// Usage:
//   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... node database/planetscale/scripts/sync-sequences.mjs            # dry run
//   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... node database/planetscale/scripts/sync-sequences.mjs --apply    # write
//
// Flags:
//   --source <url>     read-only (default $SOURCE_DATABASE_URL, then $SUPABASE_DB_URL)
//   --target <url>     written only with --apply (default $TARGET_DATABASE_URL, then $PLANETSCALE_DIRECT_URL)
//   --schemas <list>   default public,private,catalogue_private
//   --margin <n>       added to the source value (default 10000, as PlanetScale's Supabase guide does)
//   --apply            perform the setval calls (one transaction); without it nothing is written
//   --json             machine-readable plan
//
// Rules:
//   * Never moves a target sequence backwards: if the target is already at or
//     past the desired value, it is left alone (safe to re-run, safe after
//     writes on the target).
//   * Sequences never used on the source (last_value NULL) are skipped.
//   * Missing or unreadable sequences are reported and make the exit code 1.
//   * Values are handled as BigInt end to end (bigint sequences overflow JS numbers).
// Exit code: 0 ok, 1 problems (missing/unreadable/overflow), 64 usage, 70 failure.

import { parseArgs } from 'node:util';
import { connect, isMain, redactUrl, renderTable, resolveUrl, rowsOf, runCli, splitList, UsageError } from './lib/common.mjs';

export const DEFAULT_SCHEMAS = ['public', 'private', 'catalogue_private'];

const SEQUENCES_SQL = `
  select s.schemaname as schema, s.sequencename as name,
         s.last_value::text as last_value, s.increment_by::text as increment_by,
         s.min_value::text as min_value, s.max_value::text as max_value,
         pg_catalog.has_sequence_privilege(pg_catalog.format('%I.%I', s.schemaname, s.sequencename), 'SELECT') as readable
    from pg_catalog.pg_sequences s
   where s.schemaname = any($1::text[])
   order by 1, 2`;

export async function readSequences(query, schemas) {
  const rows = await query(SEQUENCES_SQL, [schemas]);
  return rows.map((r) => ({
    schema: r.schema,
    name: r.name,
    key: `${r.schema}.${r.name}`,
    lastValue: r.last_value === null ? null : BigInt(r.last_value),
    incrementBy: BigInt(r.increment_by),
    minValue: BigInt(r.min_value),
    maxValue: BigInt(r.max_value),
    readable: r.readable,
  }));
}

/**
 * Pure planning step. Returns one entry per source sequence (plus extras on
 * the target) with an action: set | skip-unused | skip-ahead | missing | unreadable | overflow | extra.
 */
export function planSync(sourceSeqs, targetSeqs, { margin = 10_000n } = {}) {
  const m = BigInt(margin);
  const targets = new Map(targetSeqs.map((s) => [s.key, s]));
  const plan = [];
  for (const src of sourceSeqs) {
    const tgt = targets.get(src.key);
    targets.delete(src.key);
    const base = { key: src.key, schema: src.schema, name: src.name, source: src.lastValue, target: tgt?.lastValue ?? null, desired: null };
    if (!src.readable) {
      plan.push({ ...base, action: 'unreadable', reason: 'no SELECT privilege on the source sequence' });
      continue;
    }
    if (!tgt) {
      plan.push({ ...base, action: 'missing', reason: 'sequence does not exist on the target' });
      continue;
    }
    if (!tgt.readable) {
      plan.push({ ...base, action: 'unreadable', reason: 'no SELECT privilege on the target sequence' });
      continue;
    }
    if (src.lastValue === null) {
      plan.push({ ...base, action: 'skip-unused', reason: 'never used on the source' });
      continue;
    }
    const ascending = src.incrementBy > 0n;
    let desired = ascending ? src.lastValue + m : src.lastValue - m;
    if (ascending && desired > tgt.maxValue) {
      if (src.lastValue >= tgt.maxValue) {
        plan.push({ ...base, action: 'overflow', reason: `source value ${src.lastValue} is at or past the target max ${tgt.maxValue}` });
        continue;
      }
      desired = tgt.maxValue;
    }
    if (!ascending && desired < tgt.minValue) {
      if (src.lastValue <= tgt.minValue) {
        plan.push({ ...base, action: 'overflow', reason: `source value ${src.lastValue} is at or past the target min ${tgt.minValue}` });
        continue;
      }
      desired = tgt.minValue;
    }
    const ahead = tgt.lastValue !== null && (ascending ? tgt.lastValue >= desired : tgt.lastValue <= desired);
    if (ahead) {
      plan.push({ ...base, desired, action: 'skip-ahead', reason: 'target is already at or past the desired value (never moved backwards)' });
      continue;
    }
    plan.push({ ...base, desired, action: 'set', reason: `source + ${ascending ? '' : '-'}${m}` });
  }
  for (const extra of targets.values()) {
    plan.push({ key: extra.key, schema: extra.schema, name: extra.name, source: null, target: extra.lastValue, desired: null, action: 'extra', reason: 'only on the target; left alone' });
  }
  return plan;
}

export const PROBLEM_ACTIONS = new Set(['missing', 'unreadable', 'overflow']);

/** Apply the `set` entries in one transaction on the target. Returns the number of sequences set. */
export async function applyPlan(targetClient, plan) {
  const toSet = plan.filter((p) => p.action === 'set');
  if (!toSet.length) return 0;
  await targetClient.query('BEGIN');
  try {
    for (const p of toSet) {
      // setval(..., true): the next nextval() returns desired + increment.
      await targetClient.query('select pg_catalog.setval(pg_catalog.format($1::text, $2::text, $3::text)::regclass, $4::bigint, true)', ['%I.%I', p.schema, p.name, p.desired.toString()]);
    }
    await targetClient.query('COMMIT');
  } catch (error) {
    await targetClient.query('ROLLBACK').catch(() => {});
    throw error;
  }
  return toSet.length;
}

function str(v) {
  return v === null || v === undefined ? '' : v.toString();
}

export function renderPlan(plan) {
  return renderTable(
    plan.map((p) => ({ seq: p.key, source: str(p.source), target: str(p.target), desired: str(p.desired), action: p.action, reason: p.reason })),
    [
      { key: 'seq', label: 'sequence' },
      { key: 'source', label: 'source last', align: 'right' },
      { key: 'target', label: 'target last', align: 'right' },
      { key: 'desired', label: 'set to', align: 'right' },
      { key: 'action', label: 'action' },
      { key: 'reason', label: 'why' },
    ],
  );
}

const USAGE = `usage: node sync-sequences.mjs [--source <url>] [--target <url>] [--schemas a,b] [--margin n] [--apply] [--json]
  dry run unless --apply. source: $SOURCE_DATABASE_URL or $SUPABASE_DB_URL; target: $TARGET_DATABASE_URL or $PLANETSCALE_DIRECT_URL`;

export async function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        source: { type: 'string' },
        target: { type: 'string' },
        schemas: { type: 'string' },
        margin: { type: 'string' },
        apply: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
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
  if (values.apply && values['dry-run']) throw new UsageError('--apply and --dry-run are mutually exclusive');
  let margin = 10_000n;
  if (values.margin !== undefined) {
    if (!/^\d+$/.test(values.margin)) throw new UsageError('--margin must be a non-negative integer');
    margin = BigInt(values.margin);
  }
  const sourceUrl = resolveUrl(values.source, ['SOURCE_DATABASE_URL', 'SUPABASE_DB_URL'], 'source');
  const targetUrl = resolveUrl(values.target, ['TARGET_DATABASE_URL', 'PLANETSCALE_DIRECT_URL'], 'target');
  const schemas = splitList(values.schemas);
  const scope = schemas.length ? schemas : DEFAULT_SCHEMAS;

  const source = await connect(sourceUrl, { readOnly: true, applicationName: 'phaseo-sync-sequences' });
  // The target stays read-only too unless --apply was given.
  const target = await connect(targetUrl, { readOnly: !values.apply, applicationName: 'phaseo-sync-sequences' });
  try {
    const plan = planSync(await readSequences(rowsOf(source), scope), await readSequences(rowsOf(target), scope), { margin });
    const problems = plan.filter((p) => PROBLEM_ACTIONS.has(p.action));
    const mode = values.apply ? 'APPLY' : 'DRY RUN (pass --apply to write)';
    let applied = 0;
    if (values.apply) {
      if (problems.length) process.stderr.write(`warning: ${problems.length} sequence(s) cannot be synced; applying the rest\n`);
      applied = await applyPlan(target, plan);
    }
    if (values.json) {
      process.stdout.write(`${JSON.stringify({ mode: values.apply ? 'apply' : 'dry-run', applied, plan }, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`);
    } else {
      process.stdout.write(`${mode}: ${redactUrl(sourceUrl)} -> ${redactUrl(targetUrl)}, margin ${margin}, schemas ${scope.join(', ')}\n`);
      process.stdout.write(renderPlan(plan));
      const count = (a) => plan.filter((p) => p.action === a).length;
      process.stdout.write(
        `\n${values.apply ? `set ${applied}` : `would set ${count('set')}`}; already ahead ${count('skip-ahead')}; unused ${count('skip-unused')}; extra on target ${count('extra')}; problems ${problems.length}\n`,
      );
    }
    return problems.length ? 1 : 0;
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

if (isMain(import.meta.url)) runCli(main, USAGE);
