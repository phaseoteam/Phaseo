import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

// The removed columns, as they were declared before this migration.
const REMOVED = [
  'daily_limit_requests',
  'weekly_limit_requests',
  'monthly_limit_requests',
  'daily_limit_cost_nanos',
  'weekly_limit_cost_nanos',
  'monthly_limit_cost_nanos',
];
const OLD_COLUMNS = REMOVED.map((column) => `  "${column}" bigint NOT NULL DEFAULT 0,`).join('\n');

const migration = await readFile(new URL('../migrations/20261021213934_drop_guardrail_budget_fields.sql', import.meta.url), 'utf8');
const tableFile = await readFile(new URL('../schemas/public/tables/workspace_guardrails.sql', import.meta.url), 'utf8');
const ws = '10000000-0000-4000-8000-000000000001';
const guardrail = '50000000-0000-4000-8000-000000000001';

// The objects the table file depends on (production shapes, trimmed).
const prelude = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema private;
  create table public.workspaces (id uuid primary key);
  create function private.capture_gateway_workspace_publication() returns trigger language plpgsql as $$ begin return null; end $$;
  create function public.is_workspace_admin(uuid) returns boolean language sql as $$ select true $$;
  create function public.is_workspace_member(uuid) returns boolean language sql as $$ select true $$;
`;

async function database(tableSql) {
  const db = new PGlite();
  await db.exec(prelude);
  await db.exec(tableSql);
  return db;
}

const columns = async (db) => (await db.query(`
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'workspace_guardrails'
  order by column_name`)).rows;

// The schema file is the table as it should be after the migration; adding the removed
// columns back gives the table as it was before.
const anchor = `  "allowed_api_model_ids"                   text[]                   NOT NULL DEFAULT '{}'::text[],\n`;
assert.ok(tableFile.includes(anchor), 'the table file still declares allowed_api_model_ids where expected');
const before = await database(tableFile.replace(anchor, `${anchor}${OLD_COLUMNS}\n`));
const declared = await database(tableFile);

try {
  // The migration is approved as destructive, with a reason, and drops exactly these columns.
  assert.match(migration, /^\s*--\s*phaseo:allow-destructive-migration\s+reason:\s*\S.{11,}$/im);
  const dropped = [...migration.matchAll(/DROP COLUMN IF EXISTS (\w+)/g)].map((match) => match[1]);
  assert.deepEqual(dropped.sort(), [...REMOVED].sort());
  for (const column of REMOVED) {
    assert.ok(!tableFile.includes(column), `${column} is gone from the table file`);
  }

  // Existing rows keep every other value.
  await before.query(
    `insert into public.workspaces values ($1)`,
    [ws],
  );
  await before.query(
    `insert into public.workspace_guardrails (id, workspace_id, name, privacy_zdr_only, allowed_api_model_ids, daily_limit_requests, monthly_limit_cost_nanos)
     values ($1, $2, 'Default policy', true, '{openai/gpt-5}', 100, 5000000000)`,
    [guardrail, ws],
  );
  await before.exec(migration);

  // After the migration the table matches the declarative schema file exactly.
  assert.deepEqual(await columns(before), await columns(declared));
  const [row] = (await before.query(`select * from public.workspace_guardrails where id = $1`, [guardrail])).rows;
  assert.equal(row.name, 'Default policy');
  assert.equal(row.privacy_zdr_only, true);
  assert.deepEqual(row.allowed_api_model_ids, ['openai/gpt-5']);
  for (const column of REMOVED) assert.ok(!(column in row), `${column} was dropped`);

  // Writers that no longer send the columns still insert. SQL that still names one fails, which is
  // why the APIs drop these fields from request bodies before they reach the database.
  await before.query(`insert into public.workspace_guardrails (workspace_id, name) values ($1, 'Second')`, [ws]);
  await assert.rejects(
    before.query(`update public.workspace_guardrails set daily_limit_requests = 1 where id = $1`, [guardrail]),
    /daily_limit_requests/,
  );

  // Running the migration again is a no-op.
  await before.exec(migration);
  assert.deepEqual(await columns(before), await columns(declared));
  console.log('drop-guardrail-budget-fields: ok');
} finally {
  await before.close();
  await declared.close();
}
