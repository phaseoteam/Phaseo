import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const asService = async fn => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const user = n => id('2', n);
const ACME = id('1', 1);
const BETA = id('1', 2);
const ENG = id('4', 1);
const SALES = id('4', 2);
const BETA_OPS = id('4', 3);
const KEY = { linked: id('3', 1), u2: id('3', 2), u3: id('3', 3), u4: id('3', 4), oauth: id('3', 5), beta: id('3', 6) };
const DOLLAR = 1_000_000_000;
const NOW = '2026-10-21T12:00:00Z';
const migrationFile = '../migrations/20261021194940_department_spend_budgets.sql';
const schemaFiles = [
    '../schemas/public/tables/workspace_department_budgets.sql',
    '../schemas/public/functions/workspace_department_budget_status.sql',
    '../schemas/public/functions/sweep_department_budget_alerts.sql',
];
const sweep = at => asService(async () => (await one('select public.sweep_department_budget_alerts($1) r', [at])).r);
const status = (workspace, at = NOW) => asService(async () => (await one('select public.workspace_department_budget_status($1, $2) r', [workspace, at])).r);
const usage = (workspace, key, bucket, cost) => db.query(
    `insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, key_id, requests, successful_requests, cost_nanos)
     values ($1, $2, 'openai/gpt-6-astra', $3, 1, 1, $4)`, [workspace, bucket, key, cost * DOLLAR]);
const events = () => rows(`select kind, dedupe_key, payload -> 'push' ->> 'title' as title, payload -> 'push' ->> 'body' as body,
  payload -> 'push' ->> 'href' as href from public.workspace_notification_events order by created_at, kind, title`);

try {
    // The migration carries every schema file it adds, and the manifest lists them.
    const migration = await read(migrationFile);
    for (const file of schemaFiles) assert.ok(migration.includes((await read(file)).replace(/\r\n/g, '\n').trim()), `${file} is in the migration`);
    const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
    for (const file of schemaFiles) {
        const path = file.replace('../schemas/', '');
        for (const list of ['loadOrder', 'files']) assert.ok(manifest[list].includes(path), `${path} is in the manifest's ${list}`);
    }

    // Production shapes, trimmed to what the migration reads.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create schema auth; create schema private;
      grant usage on schema private to service_role;
      create table auth.users (id uuid primary key);
      create table public.workspaces (id uuid primary key, name text not null);
      create function public.is_workspace_member(p_team_id uuid) returns boolean language sql stable as $$ select true $$;
      create table public.workspace_departments (
        id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade, name text not null,
        unique (id, workspace_id)
      );
      create table public.workspace_department_grants (
        workspace_id uuid not null, user_id uuid not null, department_id uuid not null, source_type text not null default 'manual',
        source_id uuid not null default gen_random_uuid(),
        foreign key (department_id, workspace_id) references public.workspace_departments(id, workspace_id) on delete cascade
      );
      create table public.workspace_member_overrides (
        workspace_id uuid not null, user_id uuid not null, department_override_enabled boolean not null default false, department_id uuid,
        primary key (workspace_id, user_id)
      );
      create table public.keys (
        id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade, name text not null,
        created_by uuid, oauth_user_id uuid, department_id uuid
      );
      create table public.gateway_requests (
        id uuid primary key default gen_random_uuid(), workspace_id uuid not null, key_id uuid, endpoint text not null,
        success boolean not null default false, cost_nanos bigint, created_at timestamptz not null default now()
      );
      create table public.v2_private_usage_15m (
        workspace_id uuid not null, bucket_start timestamptz not null, model_id text, provider_model_id text, key_id uuid, app_id uuid,
        byok boolean not null default false, requests bigint not null default 0, successful_requests bigint not null default 0,
        cost_nanos numeric(30,0) not null default 0
      );
      create table public.workspace_notification_events (
        id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
        kind text not null, category text not null, dedupe_key text not null unique, actor_user_id uuid, key_id uuid, key_created_by uuid,
        payload jsonb not null default '{}', occurred_at timestamptz not null default now(), fanned_out_at timestamptz,
        created_at timestamptz not null default clock_timestamp()
      );
    `);
    for (const file of [
        '../schemas/private/functions/workspace_push_usd.sql',
        '../schemas/private/functions/spend_limit_period.sql',
        '../schemas/private/functions/spend_limit_amount.sql',
        '../schemas/public/functions/lock_workspace_budget_change.sql',
    ]) await db.exec(await read(file));
    await db.exec(migration);

    // Acme: Engineering and Sales. u2 is in both; u3 is granted Sales but a directory override
    // moves them to Engineering only; u4's override takes them out of every department; u5 is in
    // Engineering and uses an OAuth app. The "sales-bot" key is linked to Sales, so it counts only
    // there even though its creator, u2, is also in Engineering.
    await db.exec(`
      insert into auth.users select ('20000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 6) n;
      insert into public.workspaces values ('${ACME}', 'Acme'), ('${BETA}', 'Beta');
      insert into public.workspace_departments values ('${ENG}', '${ACME}', 'Engineering'), ('${SALES}', '${ACME}', 'Sales'), ('${BETA_OPS}', '${BETA}', 'Ops');
      insert into public.workspace_department_grants (workspace_id, user_id, department_id) values
        ('${ACME}', '${user(2)}', '${ENG}'), ('${ACME}', '${user(2)}', '${SALES}'), ('${ACME}', '${user(3)}', '${SALES}'),
        ('${ACME}', '${user(4)}', '${ENG}'), ('${ACME}', '${user(5)}', '${ENG}'), ('${BETA}', '${user(6)}', '${BETA_OPS}');
      insert into public.workspace_member_overrides values
        ('${ACME}', '${user(3)}', true, '${ENG}'), ('${ACME}', '${user(4)}', true, null), ('${ACME}', '${user(5)}', false, null);
      insert into public.keys (id, workspace_id, name, created_by, oauth_user_id, department_id) values
        ('${KEY.linked}', '${ACME}', 'sales-bot', '${user(2)}', null, '${SALES}'),
        ('${KEY.u2}', '${ACME}', 'u2', '${user(2)}', null, null),
        ('${KEY.u3}', '${ACME}', 'u3', '${user(3)}', null, null),
        ('${KEY.u4}', '${ACME}', 'u4', '${user(4)}', null, null),
        ('${KEY.oauth}', '${ACME}', 'oauth', null, '${user(5)}', null),
        ('${KEY.beta}', '${BETA}', 'beta', '${user(6)}', null, null);
    `);
    await usage(ACME, KEY.u3, '2026-09-30T09:00:00Z', 500); // last month
    for (const [key, cost] of [[KEY.u2, 30], [KEY.u3, 20], [KEY.oauth, 25], [KEY.u4, 50], [KEY.linked, 40]]) await usage(ACME, key, '2026-10-05T09:00:00Z', cost);
    await usage(ACME, KEY.linked, '2026-10-21T09:00:00Z', 6);
    await usage(ACME, KEY.u2, '2026-10-21T09:15:00Z', 5);
    await usage(BETA, KEY.beta, '2026-10-21T09:00:00Z', 9);
    await db.exec(`
      insert into public.gateway_requests (workspace_id, key_id, endpoint, success, cost_nanos, created_at) values
        ('${ACME}', '${KEY.u3}', 'batch', true, ${4 * DOLLAR}, '2026-10-10T00:00:00Z'),
        ('${ACME}', '${KEY.u3}', 'batch', false, ${100 * DOLLAR}, '2026-10-10T00:00:00Z'),
        ('${ACME}', '${KEY.u3}', 'chat.completions', true, ${100 * DOLLAR}, '2026-10-10T00:00:00Z');
    `);

    // Nothing to do without budgets.
    assert.deepEqual(await sweep(NOW), { budgets: 0, alerted: 0 });

    await db.exec(`
      insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos, created_by) values
        ('${ACME}', '${ENG}', 'monthly', ${100 * DOLLAR}, '${user(1)}'),
        ('${ACME}', '${SALES}', 'daily', ${10 * DOLLAR}, '${user(1)}'),
        ('${ACME}', '${SALES}', 'monthly', ${1000 * DOLLAR}, '${user(1)}'),
        ('${BETA}', '${BETA_OPS}', 'daily', ${100 * DOLLAR}, null);
    `);

    // Engineering this month: u2 $35 (all of u2's unlinked spend), u3 $20 + a $4 batch (moved to
    // Engineering by the override), the OAuth user $25. Not u4 (override with no department), not
    // the Sales-linked key, not September, not a failed batch, and not a synchronous request from
    // gateway_requests (the rollup already has those).
    const acme = await status(ACME);
    const byName = Object.fromEntries(acme.map(b => [`${b.department_name}:${b.interval}`, b]));
    assert.deepEqual(Object.keys(byName), ['Engineering:monthly', 'Sales:daily', 'Sales:monthly']);
    assert.equal(Number(byName['Engineering:monthly'].usage_nanos), 84 * DOLLAR);
    assert.equal(Number(byName['Engineering:monthly'].remaining_nanos), 16 * DOLLAR);
    assert.equal(byName['Engineering:monthly'].exceeded, false);
    assert.equal(byName['Engineering:monthly'].window_start, '2026-10-01T00:00:00+00:00');
    assert.equal(byName['Engineering:monthly'].reset_at, '2026-11-01T00:00:00+00:00');
    // Sales today: the linked key's $6 and u2's $5. This month adds the linked key's $40 and u2's $30.
    assert.equal(Number(byName['Sales:daily'].usage_nanos), 11 * DOLLAR);
    assert.equal(byName['Sales:daily'].exceeded, true);
    assert.equal(Number(byName['Sales:monthly'].usage_nanos), 81 * DOLLAR);
    // Beta's Ops: u6's key spent $9 today; Acme's spend never leaks in.
    assert.equal(Number((await status(BETA))[0].usage_nanos), 9 * DOLLAR);

    // One sweep: Engineering warns at 84%, Sales has used its daily budget, Sales monthly (8%) and
    // Beta (9%) stay quiet.
    assert.deepEqual(await sweep(NOW), { budgets: 4, alerted: 2 });
    let sent = await events();
    assert.deepEqual(sent.map(e => [e.kind, e.title, e.body, e.href]).sort(), [
        ['department_budget_reached', 'Sales has used its daily budget', "$11.00 of $10.00 so far today. Requests keep running: department budgets send alerts but don't block.", '/settings/usage/overview'],
        ['department_budget_warning', 'Engineering is at about 80% of its monthly budget', '$84.00 of $100.00 so far this month.', '/settings/usage/overview'],
    ]);
    assert.ok(sent.every(e => e.dedupe_key.includes(':department_budget:')));
    const pushed = await one(`select category, key_id, key_created_by, payload from public.workspace_notification_events where kind = 'department_budget_warning'`);
    assert.equal(pushed.category, 'money');
    assert.equal(pushed.key_id, null, 'owners and admins hear about it; no key creator is added');
    assert.equal(pushed.payload.window, 'monthly');
    assert.equal(Number(pushed.payload.used), 84 * DOLLAR);

    // Sweeping again sends nothing new.
    assert.deepEqual(await sweep(NOW), { budgets: 4, alerted: 0 });

    // Engineering spends past the budget: the 100% alert follows, and no second warning.
    await usage(ACME, KEY.oauth, '2026-10-21T10:00:00Z', 20);
    assert.deepEqual(await sweep(NOW), { budgets: 4, alerted: 1 });
    sent = await events();
    assert.equal(sent.at(-1).title, 'Engineering has used its monthly budget');
    assert.equal(sent.at(-1).body, "$104.00 of $100.00 so far this month. Requests keep running: department budgets send alerts but don't block.");

    // Raising the limit mid-period can warn again at the new limit.
    await db.exec(`update public.workspace_department_budgets set limit_nanos = ${125 * DOLLAR} where department_id = '${ENG}'`);
    assert.deepEqual(await sweep(NOW), { budgets: 4, alerted: 1 });
    assert.equal((await events()).at(-1).body, '$104.00 of $125.00 so far this month.');

    // Tomorrow Sales's daily budget starts again.
    assert.equal(Number((await status(ACME, '2026-10-22T00:30:00Z')).find(b => b.interval === 'daily').usage_nanos), 0);

    // Budgets are unique per department and period, and only positive daily/weekly/monthly limits.
    await assert.rejects(db.exec(`insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values ('${ACME}', '${ENG}', 'monthly', 1)`), /workspace_department_budgets_department_id_interval_key/);
    await assert.rejects(db.exec(`insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values ('${ACME}', '${ENG}', 'lifetime', 1)`), /interval_check/);
    await assert.rejects(db.exec(`insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values ('${ACME}', '${ENG}', 'weekly', 0)`), /limit_nanos_check/);
    // A department from another workspace can't be budgeted.
    await assert.rejects(db.exec(`insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values ('${ACME}', '${BETA_OPS}', 'weekly', 1)`), /department_id_workspace_id_fkey/);

    // Only the service role reads spend or runs the sweep.
    for (const fn of ['workspace_department_budget_status(uuid, timestamp with time zone)', 'sweep_department_budget_alerts(timestamp with time zone)']) {
        const grants = await one(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') a, has_function_privilege('anon', 'public.${fn}', 'execute') n, has_function_privilege('service_role', 'public.${fn}', 'execute') s`);
        assert.deepEqual(grants, { a: false, n: false, s: true }, fn);
    }
    const tableGrants = await one(`select has_table_privilege('authenticated', 'public.workspace_department_budgets', 'select') sel, has_table_privilege('authenticated', 'public.workspace_department_budgets', 'insert') ins`);
    assert.deepEqual(tableGrants, { sel: true, ins: false });

    // Deleting a department deletes its budgets.
    await db.exec(`delete from public.workspace_departments where id = '${SALES}'`);
    assert.equal(Number((await one(`select count(*) n from public.workspace_department_budgets where workspace_id = '${ACME}'`)).n), 1);

    console.log('department spend budgets: ok');
} finally {
    await db.close();
}
