import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const migrations = [
    '../migrations/20261018135417_mobile_push_rules.sql',
    '../migrations/20261019170840_mobile_push_categories_and_grouping.sql',
    '../migrations/20261019175633_mobile_push_workspace_alerts.sql',
];
const v4File = '../migrations/20261019181507_mobile_push_budget_alerts.sql';
const schemaFiles = [
    '../schemas/private/functions/spend_limit_period.sql',
    '../schemas/private/functions/spend_limit_amount.sql',
    '../schemas/public/functions/record_spend_limit_reached.sql',
    '../schemas/public/functions/sweep_spend_limit_warnings.sql',
];
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const asService = async fn => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const sweep = at => asService(async () => (await one('select public.sweep_spend_limit_warnings($1) r', [at])).r);
const reached = (keyId, reason, at, workspace = ACME) => asService(async () => (await one('select public.record_spend_limit_reached($1, $2, $3, $4) r', [workspace, keyId, reason, at])).r);
const fanOut = () => asService(async () => (await one('select public.fan_out_workspace_push_events(200) r')).r);
const claim = token => asService(() => rows('select * from public.claim_mobile_push_deliveries(500, $1)', [token]));
const user = n => `00000000-0000-4000-8000-0000000004${String(n).padStart(2, '0')}`;
const ACME = '70000000-0000-4000-8000-000000000001';
const SOLO = '70000000-0000-4000-8000-000000000002';
const BETA = '70000000-0000-4000-8000-000000000003';
const KEY_CI = '80000000-0000-4000-8000-000000000001';
const KEY_PROD = '80000000-0000-4000-8000-000000000002';
const KEY_OVER = '80000000-0000-4000-8000-000000000003';
const KEY_STEADY = '80000000-0000-4000-8000-000000000004';
const DOLLAR = 1_000_000_000;
const usage = (workspace, key, bucket, { cost = 0, requests = 0 } = {}) => db.query(
    `insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, key_id, requests, successful_requests, cost_nanos) values ($1, $2, 'openai/gpt-6-astra', $3, $4, $4, $5)`,
    [workspace, bucket, key, requests, cost]);
const events = async (where = 'true') => (await rows(`select kind, dedupe_key, payload -> 'push' ->> 'title' as title, payload -> 'push' ->> 'body' as body
  from public.workspace_notification_events where ${where} order by kind, title, dedupe_key`));

try {
    // The migration carries every schema file it added, and the manifest lists them.
    const v4 = await read(v4File);
    for (const file of schemaFiles) assert.ok(v4.includes((await read(file)).trim()), `${file} is in the migration`);
    const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
    for (const file of schemaFiles) {
        const path = file.replace('../schemas/', '');
        for (const list of ['loadOrder', 'files']) assert.ok(manifest[list].includes(path), `${path} is in the manifest's ${list}`);
    }

    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create schema auth; create schema private; create schema catalogue_private;
      grant usage on schema private to service_role;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
      create table public.v2_labs (lab_slug text primary key, name text not null);
      create table public.v2_providers (provider_slug text primary key, name text not null);
      create table public.v2_models (
        model_slug text primary key, lab_slug text not null references public.v2_labs, name text not null,
        status text not null default 'active', hidden boolean not null default false,
        input_modalities text[] not null default '{text}', output_modalities text[] not null default '{text}',
        released_at timestamptz, deprecated_at timestamptz, retired_at timestamptz, removal_date timestamptz,
        replacement_model_slug text, catalogue_status text not null default 'available'
      );
      create table public.v2_model_provider_routes (
        provider_model_id text primary key, model_slug text not null references public.v2_models,
        provider_slug text not null references public.v2_providers, status text not null default 'active',
        routing_enabled boolean not null default false, access_scope text not null default 'public', is_stealth boolean not null default false
      );
      create table public.v2_pricing_skus (
        sku_id uuid primary key default gen_random_uuid(), provider_model_id text not null references public.v2_model_provider_routes,
        sku_code text not null, version integer not null default 1, status text not null default 'active', region text,
        service_tier_slug text, effective_from timestamptz not null default now(), effective_to timestamptz
      );
      create table public.v2_pricing_sku_meters (
        sku_meter_id uuid primary key default gen_random_uuid(), sku_id uuid not null references public.v2_pricing_skus,
        meter_key text not null, modality text not null, direction text, unit text not null, unit_quantity numeric not null default 1,
        price_nanos numeric not null, display_label text not null, display_unit text not null, billable boolean not null default true,
        meter_order integer not null default 100
      );
      create table public.v2_catalogue_row_history (
        event_id bigint generated always as identity primary key, table_name text not null, model_slug text, operation text not null,
        actor_user_id uuid, transaction_id bigint not null default txid_current(), before_state jsonb, after_state jsonb,
        recorded_at timestamptz not null default clock_timestamp()
      );
      create table public.model_discovery_public_announcements (model_slug text primary key, status text not null default 'pending', announced_at timestamptz);
      create table public.mobile_notification_preferences (
        user_id uuid primary key references auth.users(id) on delete cascade,
        new_model_releases_enabled boolean not null default false,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      create table public.mobile_push_devices (
        id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
        installation_id text not null, expo_push_token text not null unique, platform text not null,
        status text not null default 'active', last_seen_at timestamptz not null default now(),
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(), invalidated_at timestamptz,
        constraint mobile_push_devices_user_id_installation_id_key unique (user_id, installation_id),
        constraint mobile_push_devices_status_check check (status in ('active', 'disabled', 'invalid'))
      );
      grant select, insert, update, delete on public.mobile_notification_preferences, public.mobile_push_devices to service_role;
      create table public.model_release_push_events (
        id uuid primary key default gen_random_uuid(), model_slug text not null unique, model_name text not null, lab_name text not null,
        released_at timestamptz, status text not null default 'pending', next_attempt_at timestamptz not null default now(),
        attempts integer not null default 0, last_error text, created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(), completed_at timestamptz
      );
      create table public.model_release_push_attempts (
        id uuid primary key default gen_random_uuid(), event_id uuid not null references public.model_release_push_events,
        device_id uuid not null references public.mobile_push_devices, status text not null default 'pending',
        error_code text, error_message text, updated_at timestamptz not null default now()
      );
      create type public.workspace_role as enum ('owner', 'admin', 'member');
      create table public.users (user_id uuid primary key references auth.users(id) on delete cascade, display_name text);
      create table public.workspaces (id uuid primary key default gen_random_uuid(), name text not null, owner_user_id uuid not null);
      create table public.workspace_members (
        workspace_id uuid not null references public.workspaces(id) on delete cascade, user_id uuid not null references public.users(user_id) on delete cascade,
        role public.workspace_role not null, primary key (workspace_id, user_id)
      );
      create table public.keys (
        id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
        name text not null, status text not null default 'active', created_by uuid not null references public.users(user_id),
        daily_limit_requests bigint not null default 0, weekly_limit_requests bigint not null default 0, monthly_limit_requests bigint not null default 0,
        daily_limit_cost_nanos bigint not null default 0, weekly_limit_cost_nanos bigint not null default 0, monthly_limit_cost_nanos bigint not null default 0
      );
      create table public.workspace_budgets (
        id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
        interval text not null check (interval in ('daily', 'weekly', 'monthly', 'lifetime')), limit_nanos bigint not null check (limit_nanos > 0),
        created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (workspace_id, interval)
      );
      create table public.v2_private_usage_15m (
        workspace_id uuid not null, bucket_start timestamptz not null, model_id text, provider_model_id text, key_id uuid, app_id uuid,
        byok boolean not null default false, requests bigint not null default 0, successful_requests bigint not null default 0,
        guardrail_blocked bigint not null default 0, cost_nanos numeric(30,0) not null default 0, tokens numeric(30,12) not null default 0,
        input_tokens numeric(30,12) not null default 0, output_tokens numeric(30,12) not null default 0, reasoning_tokens numeric(30,12) not null default 0,
        cached_tokens numeric(30,12) not null default 0, updated_at timestamptz not null default now()
      );
      create unique index v2_private_usage_15m_key on public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok) nulls not distinct;
      create table public.email_outbox (
        id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), kind text not null,
        template text not null default 'generic', to_email text not null, subject text, workspace_id uuid references public.workspaces(id) on delete set null,
        user_id uuid, payload jsonb not null default '{}', attempts integer not null default 0, last_error text, sent_at timestamptz, dedupe_key text unique
      );
      create table public.workspace_audit_events (
        id uuid primary key default gen_random_uuid(), workspace_id uuid not null, actor_user_id uuid, action text not null,
        target_type text not null, target_id text not null, target_name text, metadata jsonb not null default '{}', request_id text,
        created_at timestamptz not null default now()
      );
      create table public.credit_ledger (
        id uuid primary key default gen_random_uuid(), workspace_id uuid not null, kind text not null, amount_nanos bigint not null,
        before_balance_nanos bigint not null, after_balance_nanos bigint not null, ref_type text not null default 'test', ref_id text not null default gen_random_uuid()::text,
        created_at timestamptz not null default now()
      );
    `);
    await db.exec(await read('../schemas/catalogue_private/functions/history_model.sql'));
    await db.exec(await read('../schemas/catalogue_private/functions/record_row_history.sql'));
    await db.exec(await read('../schemas/public/functions/catalog_model_is_public.sql'));
    for (const file of migrations) await db.exec(await read(file));
    await db.exec(v4);

    // Acme: u1 owns it (and a personal workspace), u2 is an admin, u3 a member who created the ci
    // key, u4 another member. Beta has a lifetime budget.
    await db.exec(`
      insert into auth.users (id, email) select ('00000000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@example.com' from generate_series(1, 4) n;
      insert into public.users (user_id, display_name) select id, null from auth.users;
      insert into public.workspaces (id, name, owner_user_id) values ('${ACME}', 'Acme', '${user(1)}'), ('${SOLO}', 'Solo', '${user(1)}'), ('${BETA}', 'Beta', '${user(2)}');
      insert into public.workspace_members (workspace_id, user_id, role) values
        ('${ACME}', '${user(1)}', 'owner'), ('${SOLO}', '${user(1)}', 'owner'), ('${ACME}', '${user(2)}', 'admin'),
        ('${ACME}', '${user(3)}', 'member'), ('${ACME}', '${user(4)}', 'member'), ('${BETA}', '${user(2)}', 'owner');
      insert into public.keys (id, workspace_id, name, created_by, daily_limit_requests, monthly_limit_cost_nanos, weekly_limit_cost_nanos, monthly_limit_requests) values
        ('${KEY_CI}', '${ACME}', 'ci', '${user(3)}', 1000, ${50 * DOLLAR}, 0, 0),
        ('${KEY_PROD}', '${ACME}', 'prod', '${user(2)}', 0, 0, ${100 * DOLLAR}, 0),
        ('${KEY_OVER}', '${ACME}', 'batch', '${user(2)}', 0, 0, 0, 100),
        ('${KEY_STEADY}', '${BETA}', 'steady', '${user(2)}', 0, ${100 * DOLLAR}, 0, 0);
      insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values ('${ACME}', 'monthly', ${100 * DOLLAR}), ('${BETA}', 'lifetime', ${10 * DOLLAR});
      insert into public.mobile_notification_preferences (user_id, enabled) select id, true from auth.users;
    `);
    await asService(async () => {
        for (let n = 1; n <= 4; n += 1) {
            await db.query(`select public.register_mobile_push_device($1, $2, $3, 'android', 'UTC', 'Pixel', '2.0.0', 2)`, [user(n), `install-b${n}`, `ExponentPushToken[b${n}]`]);
        }
    });

    // October 2026 so far: ci spends $3 a day for fifteen days, and prod $7 a day for five.
    // ci makes 850 requests on the 16th; batch made 120 against a limit of 100.
    for (let day = 1; day <= 15; day += 1) {
        const bucket = `2026-10-${String(day).padStart(2, '0')}T09:00:00Z`;
        await usage(ACME, KEY_CI, bucket, { cost: 3 * DOLLAR, requests: 10 });
        if (day <= 5) await usage(ACME, KEY_PROD, bucket, { cost: 7 * DOLLAR });
    }
    await usage(ACME, KEY_CI, '2026-10-16T06:00:00Z', { requests: 850 });
    await usage(ACME, KEY_OVER, '2026-10-05T06:00:00Z', { requests: 120 });
    await usage(BETA, KEY_STEADY, '2026-09-20T06:00:00Z', { cost: 8.5 * DOLLAR });

    // 16 Oct, noon UTC: the Acme budget is at 80%, ci at 90% of its month ($45 of $50) and 85% of
    // its day; prod's week is 9% and batch is over 100% by the rollup, so neither warns.
    const oct16 = '2026-10-16T12:00:00Z';
    assert.deepEqual(await sweep(oct16), { budgets: 2, limitedKeys: 4, warned: 4 });
    assert.deepEqual(await events(), [
        { kind: 'budget_warning', dedupe_key: `budget_warning:budget:${(await one(`select id from public.workspace_budgets where interval = 'lifetime'`)).id}:lifetime:lifetime:${10 * DOLLAR}`,
          title: 'About 80% of the lifetime budget used', body: '$8.50 of $10.00 in total.' },
        { kind: 'budget_warning', dedupe_key: `budget_warning:budget:${(await one(`select id from public.workspace_budgets where interval = 'monthly'`)).id}:monthly:2026-10-01:${100 * DOLLAR}`,
          // 15.5 days in, $80 of $100: the pace runs out 15.5 * 100 / 80 = 19.375 days into October.
          title: 'About 80% of the monthly budget used', body: '$80.00 of $100.00 so far this month. At this pace it runs out around Oct 20.' },
        { kind: 'key_limit_warning', dedupe_key: `key_limit_warning:key:${KEY_CI}:requests:daily:2026-10-16:1000`,
          title: "API key 'ci' is at about 80% of its daily limit", body: '850 of 1,000 requests so far today.' },
        { kind: 'key_limit_warning', dedupe_key: `key_limit_warning:key:${KEY_CI}:cost:monthly:2026-10-01:${50 * DOLLAR}`,
          // 15.5 * 50 / 45 = 17.2 days in: 18 October.
          title: "API key 'ci' is at about 80% of its monthly limit", body: '$45.00 of $50.00 so far this month. At this pace it runs out around Oct 18.' },
    ]);
    assert.deepEqual((await one(`select payload from public.workspace_notification_events where dedupe_key like 'budget_warning%2026-10-01%'`)).payload.runsOutAt, '2026-10-20T09:00:00+00:00');

    // No second warning in the same period, even as usage grows.
    await usage(ACME, KEY_CI, '2026-10-16T07:00:00Z', { requests: 60 });
    assert.deepEqual(await sweep('2026-10-16T12:15:00Z'), { budgets: 2, limitedKeys: 4, warned: 0 });

    // The gateway rejects ci for its monthly cost limit: one alert, however often it is told.
    assert.equal(await reached(KEY_CI, 'monthly_cost_limit_reached', '2026-10-16T13:00:00Z'), true);
    assert.equal(await reached(KEY_CI, 'monthly_cost_limit_reached', '2026-10-16T13:05:00Z'), false);
    assert.equal(await reached(KEY_CI, 'key_limit_soft_blocked', '2026-10-16T13:05:00Z'), false, 'other rejections are ignored');
    assert.equal(await reached(KEY_PROD, 'monthly_cost_limit_reached', '2026-10-16T13:05:00Z'), false, 'prod has no monthly cost limit');
    assert.equal(await reached(KEY_CI, 'daily_request_limit_reached', '2026-10-16T13:05:00Z', BETA), false, 'the key must be in the workspace');
    assert.deepEqual(await events(`kind = 'key_limit_reached'`), [{
        kind: 'key_limit_reached', dedupe_key: `key_limit_reached:key:${KEY_CI}:cost:monthly:2026-10-01:${50 * DOLLAR}`,
        title: "API key 'ci' hit its monthly limit", body: 'Requests with it are blocked until Nov 1. The limit is $50.00 a month.',
    }]);

    // 100% before 80%: on the 17th ci is blocked for its daily requests before any sweep has seen
    // 80%, so the sweep stays quiet about that day. On the 18th, a new day, it warns again.
    await usage(ACME, KEY_CI, '2026-10-17T05:00:00Z', { requests: 900 });
    await usage(ACME, KEY_CI, '2026-10-18T05:00:00Z', { requests: 850 });
    assert.equal(await reached(KEY_CI, 'daily_request_limit_reached', '2026-10-17T08:00:00Z'), true);
    assert.deepEqual(await sweep('2026-10-17T12:00:00Z'), { budgets: 2, limitedKeys: 4, warned: 0 });
    assert.deepEqual(await sweep('2026-10-18T12:00:00Z'), { budgets: 2, limitedKeys: 4, warned: 1 });
    assert.deepEqual((await events(`dedupe_key like '%:daily:%'`)).map(event => event.dedupe_key.replace(`:${KEY_CI}`, '')), [
        'key_limit_reached:key:requests:daily:2026-10-17:1000',
        'key_limit_warning:key:requests:daily:2026-10-16:1000',
        'key_limit_warning:key:requests:daily:2026-10-18:1000',
    ]);
    assert.equal(await reached(KEY_CI, 'daily_request_limit_reached', '2026-10-18T13:00:00Z'), true, 'a new day is a new alert');

    // A workspace budget used up: "requests blocked", and the date they resume.
    assert.equal(await reached(null, 'workspace_monthly_cost_budget_reached', '2026-10-20T10:00:00Z'), true);
    assert.equal(await reached(null, 'workspace_weekly_cost_budget_reached', '2026-10-20T10:00:00Z'), false, 'Acme has no weekly budget');
    assert.equal(await reached(null, 'workspace_lifetime_cost_budget_reached', '2026-10-20T10:00:00Z', BETA), true);
    assert.deepEqual((await events(`kind = 'budget_reached'`)).map(event => [event.title, event.body]), [
        ['Requests blocked by the lifetime budget', 'The $10.00 lifetime budget is used up. Raise it to resume requests.'],
        ['Requests blocked by the monthly budget', 'The $100.00 monthly budget is used up. Requests resume Nov 1, or raise the budget.'],
    ]);

    // Late in the month the pace no longer runs out before it ends, so there is no forecast; a
    // limit raised mid-period warns again at its own 80%.
    await usage(BETA, KEY_STEADY, '2026-10-29T06:00:00Z', { cost: 82 * DOLLAR });
    await db.exec(`update public.workspace_budgets set limit_nanos = ${200 * DOLLAR} where workspace_id = '${ACME}'`);
    await usage(ACME, null, '2026-10-29T06:00:00Z', { cost: 85 * DOLLAR });
    assert.deepEqual(await sweep('2026-10-30T12:00:00Z'), { budgets: 2, limitedKeys: 4, warned: 2 });
    assert.deepEqual((await events(`occurred_at = '2026-10-30T12:00:00Z'`)).map(event => [event.kind, event.title, event.body]), [
        // 29.5 * 200 / 165 = 35.8 days: past 31 October.
        ['budget_warning', 'About 80% of the monthly budget used', '$165.00 of $200.00 so far this month.'],
        ['key_limit_warning', "API key 'steady' is at about 80% of its monthly limit", '$82.00 of $100.00 so far this month.'],
    ]);

    // Fan-out: owners and admins, plus the key's creator for key limits; u4 hears nothing. The
    // events are from "October", so they are made current first.
    await db.exec(`update public.workspace_notification_events set occurred_at = now()`);
    const fanned = await fanOut();
    assert.equal(fanned.events, 12);
    const pushes = await claim('90000000-0000-4000-8000-000000000001');
    const seen = pushes.map(push => `${push.expo_push_token.slice(18, -1)} ${push.kind} ${push.category}: ${push.title}`).sort();
    assert.deepEqual(seen.filter(line => line.includes("'ci'")), [
        "b1 key_limit_reached money: Acme: API key 'ci' hit its daily limit",
        "b1 key_limit_reached money: Acme: API key 'ci' hit its daily limit",
        "b1 key_limit_reached money: Acme: API key 'ci' hit its monthly limit",
        "b1 key_limit_warning money: Acme: API key 'ci' is at about 80% of its daily limit",
        "b1 key_limit_warning money: Acme: API key 'ci' is at about 80% of its daily limit",
        "b1 key_limit_warning money: Acme: API key 'ci' is at about 80% of its monthly limit",
        "b2 key_limit_reached money: Acme: API key 'ci' hit its daily limit",
        "b2 key_limit_reached money: Acme: API key 'ci' hit its daily limit",
        "b2 key_limit_reached money: Acme: API key 'ci' hit its monthly limit",
        "b2 key_limit_warning money: Acme: API key 'ci' is at about 80% of its daily limit",
        "b2 key_limit_warning money: Acme: API key 'ci' is at about 80% of its daily limit",
        "b2 key_limit_warning money: Acme: API key 'ci' is at about 80% of its monthly limit",
        "b3 key_limit_reached money: API key 'ci' hit its daily limit",
        "b3 key_limit_reached money: API key 'ci' hit its daily limit",
        "b3 key_limit_reached money: API key 'ci' hit its monthly limit",
        "b3 key_limit_warning money: API key 'ci' is at about 80% of its daily limit",
        "b3 key_limit_warning money: API key 'ci' is at about 80% of its daily limit",
        "b3 key_limit_warning money: API key 'ci' is at about 80% of its monthly limit",
    ]);
    assert.ok(seen.includes('b1 budget_reached money: Acme: requests blocked by the monthly budget'), 'the workspace is named for u1, with a lower-case lead');
    assert.ok(seen.includes('b2 budget_reached money: Beta: requests blocked by the lifetime budget'), 'u2 is in Acme and Beta, so both are named');
    assert.ok(!seen.some(line => line.startsWith('b4') || (line.startsWith('b3') && line.includes('budget'))), 'members hear only about their own keys');
    assert.ok(pushes.every(push => push.href === (push.kind.startsWith('budget') ? '/settings/usage/overview' : '/settings/keys')));
    assert.equal((await one(`select count(*)::int n from public.email_outbox`)).n, 0, 'no email is queued');

    // Nothing configured: the sweep returns after two counts.
    await db.exec(`delete from public.workspace_budgets; update public.keys set daily_limit_requests = 0, weekly_limit_cost_nanos = 0, monthly_limit_cost_nanos = 0, monthly_limit_requests = 0`);
    assert.deepEqual(await sweep('2026-10-30T12:30:00Z'), { budgets: 0, limitedKeys: 0, warned: 0 });

    // Backend only.
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query('select public.sweep_spend_limit_warnings()'), /permission denied/);
        await assert.rejects(db.query(`select public.record_spend_limit_reached($1, null, 'workspace_monthly_cost_budget_reached')`, [ACME]), /permission denied/);
        await db.exec('reset role');
    }
    console.log('mobile push budget alerts: ok');
} finally {
    await db.close();
}
