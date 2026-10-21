import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const migrations = [
    '../migrations/20261018135417_mobile_push_rules.sql',
    '../migrations/20261019170840_mobile_push_categories_and_grouping.sql',
    '../migrations/20261019175553_mobile_push_weekly_digest.sql',
    '../migrations/20261019175633_mobile_push_workspace_alerts.sql',
    '../migrations/20261019181507_mobile_push_budget_alerts.sql',
];
const v5File = '../migrations/20261019194033_mobile_push_low_balance_sweep.sql';
const schemaFiles = [
    '../schemas/public/tables/workspace_low_balance_push_state.sql',
    '../schemas/private/functions/workspace_push_message.sql',
    '../schemas/private/functions/capture_workspace_notification_events.sql',
    '../schemas/public/functions/sweep_low_balance_pushes.sql',
];
const newFiles = [schemaFiles[0], schemaFiles[3]];
// capture_workspace_notification_events is redefined by later migrations (spend alerts); its
// schema file must match the newest migration that defines it.
const newestDefinition = async signature => {
    const names = (await readdir(new URL('../migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
    let found = '';
    for (const name of names) { const sql = await read(`../migrations/${name}`); if (sql.includes(signature)) found = sql; }
    return found;
};
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const asService = async fn => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const sweep = () => asService(async () => (await one('select public.sweep_low_balance_pushes() r')).r);
const fanOut = () => asService(async () => (await one('select public.fan_out_workspace_push_events(200) r')).r);
const claim = token => asService(() => rows('select * from public.claim_mobile_push_deliveries(500, $1)', [token]));
const complete = (token, results) => asService(async () => (await one('select public.complete_mobile_push_deliveries($1, $2) r', [token, JSON.stringify(results)])).r);
let claims = 0;
const claimToken = () => `a0000000-0000-4000-8000-${String(++claims).padStart(12, '0')}`;
// Claims everything due, sends it, and returns the pushes by device name (l1 is u1's phone).
const deliver = async () => {
    const token = claimToken();
    const pushes = await claim(token);
    await complete(token, pushes.map(push => ({ id: push.id, status: 'sent', ticketId: `ticket-${push.id}` })));
    return Object.fromEntries(pushes.map(push => [push.expo_push_token.slice(18, -1), push]));
};
const user = n => `00000000-0000-4000-8000-0000000005${String(n).padStart(2, '0')}`;
const ws = n => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [ACME, SOLO, ZERO, MUTED, NODEV, OFFPUSH, AUTO, PLAIN, LATE] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(ws);
const DOLLAR = 1_000_000_000;
const nanos = dollars => Math.round(dollars * DOLLAR);
// PGlite's clock can give two quick statements the same now(), so writes whose order matters are spaced out.
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
const balance = async (workspace, dollars) => {
    await pause();
    await db.query('update public.wallets set balance_nanos = $2 where workspace_id = $1', [workspace, nanos(dollars)]);
};
// A credit to the wallet: a card payment unless said otherwise.
const credit = async (workspace, dollars, after, refType = 'Stripe_Payment_Intent') => {
    await pause();
    await db.query(`insert into public.credit_ledger (workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos, ref_type) values ($1, 'top_up', $2, $3, $4, $5)`,
        [workspace, nanos(dollars), nanos(after - dollars), nanos(after), refType]);
    await balance(workspace, after);
};
const outbox = async (kind, payload, workspace) => {
    await pause();
    await db.query(`insert into public.email_outbox (kind, to_email, workspace_id, payload) values ($1, 'owner@example.com', $2, $3)`, [kind, workspace, JSON.stringify(payload)]);
};
const armed = async workspace => (await one('select armed from public.workspace_low_balance_push_state where workspace_id = $1', [workspace]))?.armed;
// Row versions of the whole state table: unchanged means nothing was written.
const stamp = async () => (await one(`select coalesce(string_agg(workspace_id || ':' || xmin, ',' order by workspace_id), '') s from public.workspace_low_balance_push_state`)).s;
const lowEvents = () => rows(`select workspace_id, payload from public.workspace_notification_events where kind = 'low_balance' order by occurred_at, id`);
let watching = 5;
const swept = (fields = {}) => ({ watched: watching, firstSeen: 0, dropped: 0, rearmed: 0, coveredByTopUp: 0, alerted: 0, ...fields });
const quiet = { captured: 0, events: 0, queued: 0, deferred: 0 };
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

try {
    // The migration carries every schema file it added or changed, and the manifest lists the new ones.
    const v5 = await read(v5File);
    const captureMigration = await newestDefinition('CREATE OR REPLACE FUNCTION private.capture_workspace_notification_events');
    const sweepMigration = await newestDefinition('CREATE OR REPLACE FUNCTION public.sweep_low_balance_pushes');
    for (const file of schemaFiles) {
        const migration = file === schemaFiles[2] ? captureMigration : file === schemaFiles[3] ? sweepMigration : v5;
        assert.ok(migration.replace(/\r\n/g, '\n').includes((await read(file)).replace(/\r\n/g, '\n').trim()), `${file} is in the newest migration that defines it`);
    }
    assert.ok((await newestDefinition('CREATE OR REPLACE FUNCTION private.workspace_auto_top_up_covers'))
        .includes((await read('../schemas/private/functions/workspace_auto_top_up_covers.sql')).replace(/\r\n/g, '\n').trim()), 'the shared auto top-up test is migrated');
    const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
    for (const file of newFiles) {
        const path = file.replace('../schemas/', '');
        for (const list of ['loadOrder', 'files']) assert.ok(manifest[list].includes(path), `${path} is in the manifest's ${list}`);
    }
    assert.doesNotMatch(await read(schemaFiles[2]), /'low_balance'/, 'the capture no longer reads low balance emails');
    assert.ok(!/\b(drop\s+(table|schema|type|view|column|function)|truncate|delete\s+from)\b/i.test(v5), 'the migration is not destructive');
    assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/mobile-push-low-balance\.test\.mjs/, 'CI runs this suite');

    // Pre-existing objects in production shape, trimmed to what the migrations use.
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
      create index workspace_members_user_idx on public.workspace_members (user_id);
      create table public.keys (
        id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
        name text not null, status text not null default 'active', created_by uuid not null references public.users(user_id),
        daily_limit_requests bigint not null default 0, weekly_limit_requests bigint not null default 0, monthly_limit_requests bigint not null default 0,
        daily_limit_cost_nanos bigint not null default 0, weekly_limit_cost_nanos bigint not null default 0, monthly_limit_cost_nanos bigint not null default 0
      );
      create table public.management_keys (
        id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
        name text not null, created_by uuid references public.users(user_id) on delete set null
      );
      create table public.gateway_requests (
        id uuid primary key default gen_random_uuid(), workspace_id uuid not null, key_id uuid, endpoint text not null,
        success boolean not null default false, cost_nanos bigint, created_at timestamptz not null default now()
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
      create index credit_ledger_workspace_id_idx on public.credit_ledger (workspace_id);
      -- What the sweep reads besides the push tables: wallets, the low-balance threshold and the
      -- failure-alert switch, and the request charges get_workspace_recent_credit_spend sums.
      create table public.wallets (
        workspace_id uuid primary key references public.workspaces(id) on delete cascade, stripe_customer_id text not null default 'cus_test',
        balance_nanos bigint not null default 0, auto_top_up_enabled boolean not null default false, low_balance_threshold bigint not null default 0,
        auto_top_up_amount bigint not null default 0, auto_top_up_account_id text, reserved_nanos bigint not null default 0,
        updated_at timestamptz not null default now()
      );
      create table public.workspace_settings (
        workspace_id uuid primary key references public.workspaces(id) on delete cascade,
        low_balance_email_enabled boolean not null default false, low_balance_email_threshold_nanos bigint not null default 0,
        low_balance_email_last_sent_at timestamptz, low_balance_email_last_sent_balance_nanos bigint,
        auto_top_up_failure_email_enabled boolean not null default true, payment_method_expiring_email_enabled boolean not null default true
      );
      create table public.gateway_request_charges (
        workspace_id uuid not null, request_id text not null, cost_nanos bigint not null check (cost_nanos > 0),
        status text not null default 'applying', created_at timestamptz not null default now(), primary key (workspace_id, request_id)
      );
    `);
    await db.exec(await read('../schemas/catalogue_private/functions/history_model.sql'));
    await db.exec(await read('../schemas/catalogue_private/functions/record_row_history.sql'));
    await db.exec(await read('../schemas/public/functions/catalog_model_is_public.sql'));
    await db.exec(await read('../schemas/public/functions/get_workspace_recent_credit_spend.sql'));
    for (const file of migrations) await db.exec(await read(file));
    await db.exec(v5);
    // The spend rules balance migration moved the auto top-up test into a shared helper and
    // re-created the sweep around it; run the current definitions.
    await db.exec(await read('../schemas/private/functions/workspace_auto_top_up_covers.sql'));
    await db.exec(await read(schemaFiles[3]));

    // u1 owns Acme and a personal workspace (Solo, $0); u2 is an Acme admin and u3 a member. u4 owns
    // Zero, which never bought credits. u5 has money pushes off, u6 no active device and u9 push off.
    // u7 owns Auto, on auto top-up ($25 when the balance falls below $5), and u8 owns Plain.
    // Acme's email alert is off but keeps its $10 threshold; Plain's was switched off in the web
    // settings, which stores 0.
    await db.exec(`
      insert into auth.users (id, email) select ('00000000-0000-4000-8000-0000000005' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@example.com' from generate_series(1, 9) n;
      insert into public.users (user_id) select id from auth.users;
      insert into public.workspaces (id, name, owner_user_id) values
        ('${ACME}', 'Acme', '${user(1)}'), ('${SOLO}', 'Daniel''s workspace', '${user(1)}'), ('${ZERO}', 'Zero', '${user(4)}'), ('${MUTED}', 'Muted', '${user(5)}'),
        ('${NODEV}', 'No device', '${user(6)}'), ('${OFFPUSH}', 'Push off', '${user(9)}'), ('${AUTO}', 'Auto', '${user(7)}'), ('${PLAIN}', 'Plain', '${user(8)}');
      insert into public.workspace_members (workspace_id, user_id, role) values
        ('${ACME}', '${user(1)}', 'owner'), ('${SOLO}', '${user(1)}', 'owner'), ('${ACME}', '${user(2)}', 'admin'), ('${ACME}', '${user(3)}', 'member'),
        ('${ZERO}', '${user(4)}', 'owner'), ('${MUTED}', '${user(5)}', 'owner'), ('${NODEV}', '${user(6)}', 'owner'), ('${OFFPUSH}', '${user(9)}', 'owner'),
        ('${AUTO}', '${user(7)}', 'owner'), ('${PLAIN}', '${user(8)}', 'owner');
      insert into public.wallets (workspace_id, balance_nanos) values
        ('${ACME}', ${nanos(20)}), ('${SOLO}', 0), ('${ZERO}', 0), ('${MUTED}', ${nanos(20)}), ('${NODEV}', ${nanos(20)}), ('${OFFPUSH}', ${nanos(20)}), ('${PLAIN}', ${nanos(8)});
      insert into public.wallets (workspace_id, balance_nanos, auto_top_up_enabled, low_balance_threshold, auto_top_up_amount, auto_top_up_account_id)
        values ('${AUTO}', ${nanos(50)}, true, ${nanos(5)}, ${nanos(25)}, 'pm_card');
      insert into public.workspace_settings (workspace_id, low_balance_email_enabled, low_balance_email_threshold_nanos) values
        ('${ACME}', false, ${nanos(10)}), ('${PLAIN}', false, 0), ('${AUTO}', false, 0);
      insert into public.mobile_notification_preferences (user_id, enabled) select id, true from auth.users;
      update public.mobile_notification_preferences set categories = '{"money": false}' where user_id = '${user(5)}';
      update public.mobile_notification_preferences set enabled = false where user_id = '${user(9)}';
    `);
    await asService(async () => {
        for (let n = 1; n <= 9; n += 1) {
            await db.query(`select public.register_mobile_push_device($1, $2, $3, 'android', 'UTC', 'Pixel', '2.0.0', 2)`, [user(n), `install-l${n}`, `ExponentPushToken[l${n}]`]);
        }
    });
    await db.exec(`update public.mobile_push_devices set status = 'disabled' where user_id = '${user(6)}'`);

    // First sight: only workspaces an owner or admin gets money pushes for are read, each armed
    // only if above its threshold. Muted, No device and Push off are not checked at all.
    assert.deepEqual(await sweep(), swept({ firstSeen: 5 }));
    assert.deepEqual(await rows('select workspace_id, armed, threshold_nanos::text as threshold from public.workspace_low_balance_push_state order by workspace_id'), [
        { workspace_id: ACME, armed: true, threshold: String(nanos(10)) },
        { workspace_id: SOLO, armed: false, threshold: String(nanos(5)) },
        { workspace_id: ZERO, armed: false, threshold: String(nanos(5)) },
        { workspace_id: AUTO, armed: true, threshold: String(nanos(5)) },
        { workspace_id: PLAIN, armed: true, threshold: String(nanos(5)) },
    ]);
    assert.deepEqual(await fanOut(), quiet, 'the first fan-out only sets the capture cursors');

    // Idle: nothing changed, so nothing is written.
    let before = await stamp();
    for (let run = 0; run < 3; run += 1) assert.deepEqual(await sweep(), swept());
    assert.equal(await stamp(), before, 'an idle sweep writes no state');
    assert.deepEqual(await lowEvents(), []);

    // Acme was charged $11.20 in the last seven days: $10.20 of requests (an older one, and a
    // failed one, do not count) and a $1 async job. At $1.60 a day, $3.20 lasts 2 days.
    await db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, created_at) values
      ($1, 'a', 8000000000, 'applied', now() - interval '2 days'), ($1, 'b', 2200000000, 'applied', now() - interval '1 day'),
      ($1, 'old', 50000000000, 'applied', now() - interval '9 days'), ($1, 'failed', 4000000000, 'failed', now() - interval '1 day')`, [ACME]);
    await db.query(`insert into public.credit_ledger (workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos, created_at)
      values ($1, 'charge', -1000000000, 0, 0, now() - interval '3 days')`, [ACME]);

    // Crossing the threshold sends once, to owners and admins: the workspace is named for u1, who
    // belongs to two, and not for u2. u3, a member, hears nothing.
    await balance(ACME, 3.2);
    assert.deepEqual(await sweep(), swept({ dropped: 1, alerted: 1 }));
    assert.deepEqual(await lowEvents(), [{ workspace_id: ACME, payload: {
        balance_nanos: nanos(3.2), threshold_nanos: nanos(10), threshold_source: 'workspace', recent_spend_nanos: nanos(11.2), spend_window_days: 7,
    } }]);
    assert.deepEqual(await fanOut(), { ...quiet, events: 1, queued: 2 });
    let pushes = await deliver();
    assert.deepEqual(Object.keys(pushes).sort(), ['l1', 'l2']);
    assert.deepEqual({ ...pushes.l1, id: null }, {
        id: null, attempts: 1, expo_push_token: 'ExponentPushToken[l1]', channel_scheme: 2, kind: 'low_balance', category: 'money', model_slug: null,
        title: 'Acme: balance is $3.20', body: "About 2 days left at this week's pace. Add credits to keep requests running.", href: '/settings/credits',
        group_key: null, group_count: null, tag: null, deliveries: 1, workspace_id: ACME, workspace_name: 'Acme',
    });
    assert.deepEqual([pushes.l2.title, pushes.l2.body, pushes.l2.workspace_name], ['Balance is $3.20', pushes.l1.body, 'Acme']);
    assert.ok((await one('select last_alert_at is not null as alerted from public.workspace_low_balance_push_state where workspace_id = $1', [ACME])).alerted);

    // Staying low does not resend, and neither does a top-up that leaves it below the threshold.
    before = await stamp();
    await balance(ACME, 2.1);
    assert.deepEqual(await sweep(), swept());
    await credit(ACME, 3.9, 6);
    assert.deepEqual(await sweep(), swept(), 'still at or below $10');
    assert.equal(await stamp(), before);
    assert.deepEqual(await fanOut(), quiet);

    // Back above the threshold re-arms it; the next drop is pushed again.
    await credit(ACME, 20, 26);
    assert.deepEqual(await sweep(), swept({ rearmed: 1 }));
    assert.equal(await armed(ACME), true);
    await balance(ACME, 9.99);
    assert.deepEqual(await sweep(), swept({ dropped: 1, alerted: 1 }));
    assert.deepEqual(await fanOut(), { ...quiet, events: 1, queued: 2 });
    pushes = await deliver();
    assert.deepEqual([pushes.l2.title, pushes.l2.body], ['Balance is $9.99', "About 6 days left at this week's pace. Add credits to keep requests running."]);

    // The email path still writes its row; the fan-out no longer reads it, so it is never a second push.
    await outbox('low_balance', { workspace_id: ACME, team_name: 'Acme', balance_nanos: nanos(9.99), threshold_nanos: nanos(10) }, ACME);
    assert.deepEqual(await fanOut(), quiet, 'a low balance email is not captured');

    // First sight below the threshold sends nothing: u2 starts Late with $2 (no settings, so $5).
    await db.exec(`
      insert into public.workspaces (id, name, owner_user_id) values ('${LATE}', 'Late', '${user(2)}');
      insert into public.workspace_members (workspace_id, user_id, role) values ('${LATE}', '${user(2)}', 'owner');
      insert into public.wallets (workspace_id, balance_nanos) values ('${LATE}', ${nanos(2)});
    `);
    watching = 6;
    assert.deepEqual(await sweep(), swept({ firstSeen: 1 }));
    assert.equal(await armed(LATE), false);
    await balance(LATE, 1);
    assert.deepEqual(await sweep(), swept());

    // Money off, no active device or push off: the balance is never read, so nothing is sent.
    for (const workspace of [MUTED, NODEV, OFFPUSH]) await balance(workspace, 1);
    assert.deepEqual(await sweep(), swept());
    assert.deepEqual(await rows(`select workspace_id from public.workspace_low_balance_push_state where workspace_id in ('${MUTED}', '${NODEV}', '${OFFPUSH}')`), [], 'never checked');
    // u5 turns money back on at $1: first seen below the threshold, so still nothing.
    await db.exec(`update public.mobile_notification_preferences set categories = '{}' where user_id = '${user(5)}'`);
    watching = 7;
    assert.deepEqual(await sweep(), swept({ firstSeen: 1 }));
    assert.equal(await armed(MUTED), false);

    // The default threshold: Plain stores 0, so $5 applies, and at the threshold counts. With no
    // spend this week there is no forecast.
    await balance(PLAIN, 5);
    assert.deepEqual(await sweep(), swept({ dropped: 1, alerted: 1 }));
    assert.deepEqual((await lowEvents()).at(-1).payload, {
        balance_nanos: nanos(5), threshold_nanos: nanos(5), threshold_source: 'default', recent_spend_nanos: 0, spend_window_days: 7,
    });
    assert.deepEqual(await fanOut(), { ...quiet, events: 1, queued: 1 });
    pushes = await deliver();
    assert.deepEqual([pushes.l8.title, pushes.l8.body], ['Balance is $5.00', 'Add credits to keep requests running.']);

    // The forecast's wording, as the web's credit runway: under a cent a day says nothing, and past
    // 90 days says so. An empty wallet has nothing to forecast.
    const forecast = async (balanceUsd, spendUsd, workspaceName = null) => (await one('select private.workspace_push_message($1, $2, $3, false, $4) m',
        ['low_balance', 'money', JSON.stringify({ balance_nanos: nanos(balanceUsd), threshold_nanos: nanos(5), recent_spend_nanos: nanos(spendUsd), spend_window_days: 7 }), workspaceName])).m;
    const lasts = async (balanceUsd, spendUsd) => (await forecast(balanceUsd, spendUsd)).body.replace(' Add credits to keep requests running.', '');
    assert.equal(await lasts(3.2, 50), "Less than a day left at this week's pace.");
    assert.equal(await lasts(1.6, 11.2), "About 1 day left at this week's pace.");
    assert.equal(await lasts(2.39, 11.2), "About 1 day left at this week's pace.");
    assert.equal(await lasts(2.4, 11.2), "About 2 days left at this week's pace.");
    assert.equal(await lasts(5, 0.21), "More than 90 days left at this week's pace.");
    assert.equal(await lasts(5, 0.035), 'Add credits to keep requests running.', 'half a cent a day is no pace');
    assert.equal(await lasts(0, 11.2), 'Add credits to keep requests running.');
    assert.deepEqual(await forecast(3.2, 11.2, 'Acme'), {
        kind: 'low_balance', category: 'money', title: 'Acme: balance is $3.20',
        body: "About 2 days left at this week's pace. Add credits to keep requests running.", href: '/settings/credits', modelSlug: null,
    });

    // Auto top-up on and working: a drop is recorded, not pushed, and the top-up re-arms it.
    await balance(AUTO, 4.8);
    assert.deepEqual(await sweep(), swept({ dropped: 1, coveredByTopUp: 1 }));
    await credit(AUTO, 25, 29.8);
    assert.deepEqual(await sweep(), swept({ rearmed: 1 }));
    // A top-up that fails is pushed as such. The job sweeps before the fan-out captures the
    // failure, so the drop is recorded as covered; later sweeps, which see the failure, find it
    // already recorded. One push, not two.
    await balance(AUTO, 4.9);
    await outbox('auto_top_up_failed', { workspace_name: 'Auto', reason: 'Your card was declined.' }, AUTO);
    assert.deepEqual(await sweep(), swept({ dropped: 1, coveredByTopUp: 1 }));
    assert.deepEqual(await fanOut(), { ...quiet, captured: 1, events: 1, queued: 1 });
    pushes = await deliver();
    assert.deepEqual([pushes.l7.kind, pushes.l7.title, pushes.l7.body], ['auto_top_up_failed', 'Auto top-up failed', 'Your card was declined.']);
    await balance(AUTO, 1);
    assert.deepEqual(await sweep(), swept());
    assert.deepEqual(await fanOut(), quiet);
    // A card payment since the failure: working again.
    await credit(AUTO, 25, 26);
    assert.deepEqual(await sweep(), swept({ rearmed: 1 }));
    await balance(AUTO, 4.5);
    assert.deepEqual(await sweep(), swept({ dropped: 1, coveredByTopUp: 1 }));
    await credit(AUTO, 25, 29.5);
    assert.deepEqual(await sweep(), swept({ rearmed: 1 }));
    // A grant is not a card payment: after a failure it does not make auto top-up work again.
    // Here the top-up triggers at $20, above the $5 alert: it fails at $19 and that is pushed;
    // with no card payment since, it is not working, so the later drop to $4 is pushed too.
    await db.exec(`update public.wallets set low_balance_threshold = ${nanos(20)} where workspace_id = '${AUTO}'`);
    await balance(AUTO, 19);
    await outbox('auto_top_up_failed', { workspace_name: 'Auto', reason: 'Your card was declined.' }, AUTO);
    assert.deepEqual(await sweep(), swept(), 'still above the $5 alert');
    assert.deepEqual(await fanOut(), { ...quiet, captured: 1, events: 1, queued: 1 });
    await deliver();
    await credit(AUTO, 2, 21, 'promo_grant');
    await balance(AUTO, 4);
    assert.deepEqual(await sweep(), swept({ dropped: 1, alerted: 1 }));
    assert.deepEqual(await fanOut(), { ...quiet, events: 1, queued: 1 });
    pushes = await deliver();
    assert.deepEqual([pushes.l7.kind, pushes.l7.title, pushes.l7.body], ['low_balance', 'Balance is $4.00', 'Add credits to keep requests running.']);
    // Set-ups that never top up, or whose failure would not be heard, push like no auto top-up.
    await db.exec(`update public.wallets set low_balance_threshold = ${nanos(5)} where workspace_id = '${AUTO}'`);
    await credit(AUTO, 25, 29);
    assert.deepEqual(await sweep(), swept({ rearmed: 1 }));
    for (const [setup, sql] of [
        ['less than $1 to add', `update public.wallets set auto_top_up_amount = 500000000 where workspace_id = '${AUTO}'`],
        ['a $0 trigger', `update public.wallets set auto_top_up_amount = ${nanos(25)}, low_balance_threshold = 0 where workspace_id = '${AUTO}'`],
        ['failure alerts off', `update public.wallets set low_balance_threshold = ${nanos(5)} where workspace_id = '${AUTO}';
          update public.workspace_settings set auto_top_up_failure_email_enabled = false where workspace_id = '${AUTO}'`],
        ['auto top-up off', `update public.workspace_settings set auto_top_up_failure_email_enabled = true where workspace_id = '${AUTO}';
          update public.wallets set auto_top_up_enabled = false where workspace_id = '${AUTO}'`],
    ]) {
        await db.exec(sql);
        await balance(AUTO, 4);
        assert.deepEqual(await sweep(), swept({ dropped: 1, alerted: 1 }), `${setup}: pushed`);
        await credit(AUTO, 25, 29);
        assert.deepEqual(await sweep(), swept({ rearmed: 1 }), `${setup}: re-armed`);
    }
    assert.deepEqual(await fanOut(), { ...quiet, events: 4, queued: 4 });
    await deliver();

    // A $0 workspace is never told: neither Zero nor Solo ever had a low balance push.
    assert.deepEqual((await lowEvents()).filter(event => [ZERO, SOLO].includes(event.workspace_id)), []);
    assert.deepEqual([await armed(ZERO), await armed(SOLO)], [false, false]);

    // Cost, timed as medians of 50 sweeps after five to warm up. First at this size, about
    // production's today (one app user, twelve workspaces).
    const timeIdleSweeps = async () => {
        const timings = [];
        for (let run = 0; run < 55; run += 1) {
            const started = performance.now();
            assert.deepEqual(await sweep(), swept());
            if (run >= 5) timings.push(performance.now() - started);
        }
        return timings;
    };
    before = await stamp();
    const small = await timeIdleSweeps();
    assert.equal(await stamp(), before, 'idle sweeps write nothing');
    // Then with 2,000 more app users, each owning a workspace above its threshold, half of them
    // admins of a second one: 2,007 workspaces read per sweep.
    const bulkUser = 'c0000000-0000-4000-8000-';
    const bulkWorkspace = 'd0000000-0000-4000-8000-';
    await db.exec(`
      insert into auth.users (id, email) select ('${bulkUser}' || lpad(n::text, 12, '0'))::uuid, 'bulk' || n || '@example.com' from generate_series(1, 2000) n;
      insert into public.users (user_id) select ('${bulkUser}' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 2000) n;
      insert into public.workspaces (id, name, owner_user_id)
        select ('${bulkWorkspace}' || lpad(n::text, 12, '0'))::uuid, 'Bulk ' || n, ('${bulkUser}' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 2000) n;
      insert into public.workspace_members (workspace_id, user_id, role)
        select ('${bulkWorkspace}' || lpad(n::text, 12, '0'))::uuid, ('${bulkUser}' || lpad(n::text, 12, '0'))::uuid, 'owner' from generate_series(1, 2000) n;
      insert into public.workspace_members (workspace_id, user_id, role)
        select ('${bulkWorkspace}' || lpad(n::text, 12, '0'))::uuid, ('${bulkUser}' || lpad((n + 1)::text, 12, '0'))::uuid, 'admin' from generate_series(1, 1999, 2) n;
      insert into public.wallets (workspace_id, balance_nanos) select ('${bulkWorkspace}' || lpad(n::text, 12, '0'))::uuid, (10 + n % 90)::bigint * ${DOLLAR} from generate_series(1, 2000) n;
      insert into public.mobile_notification_preferences (user_id, enabled) select ('${bulkUser}' || lpad(n::text, 12, '0'))::uuid, true from generate_series(1, 2000) n;
      insert into public.mobile_push_devices (user_id, installation_id, expo_push_token, platform, channel_scheme)
        select ('${bulkUser}' || lpad(n::text, 12, '0'))::uuid, 'install-bulk' || n, 'ExponentPushToken[bulk' || n || ']', 'android', 2 from generate_series(1, 2000) n;
      insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, created_at)
        select ('${bulkWorkspace}' || lpad((1 + n % 2000)::text, 12, '0'))::uuid, 'bulk-' || n, 25000000, 'applied', now() - make_interval(mins => n % 10000)
        from generate_series(1, 40000) n;
      analyze;
    `);
    const smallWatching = watching;
    watching = 2007;
    assert.deepEqual(await sweep(), swept({ firstSeen: 2000 }));
    before = await stamp();
    const idle = await timeIdleSweeps();
    assert.equal(await stamp(), before, 'idle sweeps write nothing');
    // 100 of them drop below $5 at once: the forecast is worked out for those 100 only.
    await db.exec(`update public.wallets set balance_nanos = ${nanos(4)} where workspace_id in (select ('${bulkWorkspace}' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 100) n)`);
    const started = performance.now();
    assert.deepEqual(await sweep(), swept({ dropped: 100, alerted: 100 }));
    const dropping = performance.now() - started;
    assert.ok((await one(`select bool_and((payload ->> 'recent_spend_nanos')::bigint > 0) ok from public.workspace_notification_events where kind = 'low_balance' and workspace_id::text like 'd0000000%'`)).ok);
    console.log(`low balance sweep, idle median: ${median(small).toFixed(2)} ms over ${smallWatching} workspaces, ${median(idle).toFixed(2)} ms over ${watching} (max ${Math.max(...idle).toFixed(2)} ms); with 100 drops ${dropping.toFixed(2)} ms`);
    assert.ok(median(idle) < 1000, `an idle sweep stays cheap (${median(idle).toFixed(2)} ms)`);

    // Backend only: the job calls it as the service role, which can read the state but not write it.
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query('select public.sweep_low_balance_pushes()'), /permission denied/);
        await assert.rejects(db.query('select * from public.workspace_low_balance_push_state'), /permission denied/);
        await db.exec('reset role');
    }
    await asService(async () => {
        assert.ok((await one('select count(*)::int n from public.workspace_low_balance_push_state')).n > 2000);
        await assert.rejects(db.query('update public.workspace_low_balance_push_state set armed = true'), /permission denied/);
    });
    console.log('mobile push low balance: ok');
} finally {
    await db.close();
}
