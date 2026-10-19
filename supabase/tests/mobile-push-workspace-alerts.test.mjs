import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const v1File = '../migrations/20261018135417_mobile_push_rules.sql';
const v2File = '../migrations/20261019170840_mobile_push_categories_and_grouping.sql';
const digestFile = '../migrations/20261019175553_mobile_push_weekly_digest.sql';
const v3File = '../migrations/20261019175633_mobile_push_workspace_alerts.sql';
const schemaFiles = [
    '../schemas/public/tables/workspace_notification_events.sql',
    '../schemas/public/tables/workspace_notification_cursors.sql',
    '../schemas/private/functions/workspace_push_usd.sql',
    '../schemas/private/functions/workspace_push_message.sql',
    '../schemas/private/functions/capture_workspace_notification_events.sql',
    '../schemas/public/functions/fan_out_workspace_push_events.sql',
    '../schemas/public/functions/claim_mobile_push_deliveries.sql',
];
const newFiles = schemaFiles.slice(0, 6);
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const asService = async fn => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const fanOut = () => asService(async () => (await one('select public.fan_out_workspace_push_events(200) r')).r);
const claim = token => asService(() => rows('select * from public.claim_mobile_push_deliveries(500, $1)', [token]));
const complete = (token, results) => asService(async () => (await one('select public.complete_mobile_push_deliveries($1, $2) r', [token, JSON.stringify(results)])).r);
const sendAll = (token, pushes) => complete(token, pushes.map(push => ({ id: push.id, status: 'sent', ticketId: `ticket-${push.id}` })));
let claims = 0;
const claimToken = () => `40000000-0000-4000-8000-${String(++claims).padStart(12, '0')}`;
const user = n => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`;
const ACME = '50000000-0000-4000-8000-000000000001';
const SOLO = '50000000-0000-4000-8000-000000000002';
const KEY_CI = '60000000-0000-4000-8000-000000000001';
const KEY_PROD = '60000000-0000-4000-8000-000000000002';
const KEY_CHAT = '60000000-0000-4000-8000-000000000003';
// Claimed pushes by device name, the installation id without its prefix.
const byDevice = async pushes => {
    const names = Object.fromEntries((await rows('select id, installation_id from public.mobile_push_devices')).map(row => [row.id, row.installation_id.slice(8)]));
    const tokens = Object.fromEntries((await rows('select expo_push_token, id from public.mobile_push_devices')).map(row => [row.expo_push_token, names[row.id]]));
    return Object.fromEntries(pushes.map(push => [tokens[push.expo_push_token], push]));
};
const outbox = (kind, payload, workspace = ACME) => db.query(`insert into public.email_outbox (kind, to_email, workspace_id, payload) values ($1, 'owner@example.com', $2, $3)`, [kind, workspace, JSON.stringify(payload)]);
const audit = (actor, action, keyId, keyName, metadata = {}) => db.query(
    `insert into public.workspace_audit_events (workspace_id, actor_user_id, action, target_type, target_id, target_name, metadata) values ($1, $2, $3, 'api_key', $4, $5, $6)`,
    [ACME, actor, action, keyId, keyName, JSON.stringify(metadata)]);
const message = async (kind, category, payload, isActor = false, workspaceName = null) =>
    (await one('select private.workspace_push_message($1, $2, $3, $4, $5) m', [kind, category, JSON.stringify(payload), isActor, workspaceName])).m;

try {
    // The migration carries every schema file it changed, and the manifest lists the new ones.
    const v3 = await read(v3File);
    for (const file of schemaFiles) assert.ok(v3.includes((await read(file)).trim()), `${file} is in the migration`);
    const deliveries = await read('../schemas/public/tables/mobile_push_deliveries.sql');
    for (const text of [
        'CONSTRAINT "mobile_push_deliveries_message_check" CHECK (((event_id IS NOT NULL) OR (digest_id IS NOT NULL) OR (message IS NOT NULL)))',
        'CONSTRAINT "mobile_push_deliveries_workspace_event_id_device_id_key" UNIQUE (workspace_event_id, device_id)',
        'FOREIGN KEY (workspace_event_id) REFERENCES public.workspace_notification_events(id) ON DELETE CASCADE',
        'FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE',
        'CREATE INDEX mobile_push_deliveries_workspace_idx ON public.mobile_push_deliveries USING btree (workspace_id)\n  WHERE (workspace_id IS NOT NULL);',
    ]) {
        assert.ok(deliveries.includes(text), `mobile_push_deliveries.sql declares ${text.slice(0, 60)}`);
        assert.ok(v3.includes(text.startsWith('CONSTRAINT') ? `ADD ${text}` : text), `the migration carries ${text.slice(0, 60)}`);
    }
    assert.match(deliveries, /"event_id"\s+uuid,\n/, 'event_id is nullable');
    // event_id became nullable, and workspace_id was added, by the weekly digest; one definition each.
    assert.match(v3, /ADD COLUMN IF NOT EXISTS "workspace_id" uuid,/);
    assert.doesNotMatch(v3, /DROP NOT NULL/);
    for (const column of ['workspace_event_id', 'message']) assert.match(v3, new RegExp(`ADD COLUMN "${column}" `));
    // Weekly digest rows stay out of every part of the catalogue claim.
    const claimFile = await read('../schemas/public/functions/claim_mobile_push_deliveries.sql');
    assert.equal(claimFile.match(/digest_id is null/g)?.length, 4, 'the cleanup, the stale reset, the due scan and the locked scan skip digest rows');
    assert.ok(claimFile.indexOf('pg_try_advisory_xact_lock') < claimFile.indexOf('update public.mobile_push_deliveries'), 'the claim takes its lock first');
    for (const statement of deliveries.match(/^COMMENT ON [^\n]*;$/gm)) {
        if (/"(event_id|message|workspace_event_id|workspace_id)"|COMMENT ON TABLE/.test(statement)) assert.ok(v3.includes(statement), `${statement.slice(0, 80)} is in the migration`);
    }
    for (const [file, index] of [['email_outbox', 'email_outbox_created_at_idx'], ['workspace_audit_events', 'workspace_audit_events_api_key_created_idx']]) {
        const statement = (await read(`../schemas/public/tables/${file}.sql`)).match(new RegExp(`CREATE INDEX ${index}[^;]*;`))?.[0];
        assert.ok(statement && v3.includes(statement), `${index} is declared and carried`);
    }
    const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
    for (const file of newFiles) {
        const path = file.replace('../schemas/', '');
        for (const list of ['loadOrder', 'files']) assert.ok(manifest[list].includes(path), `${path} is in the manifest's ${list}`);
    }

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
      create table public.keys (
        id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
        name text not null, status text not null default 'active', created_by uuid not null references public.users(user_id)
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
    `);
    await db.exec(await read('../schemas/catalogue_private/functions/history_model.sql'));
    await db.exec(await read('../schemas/catalogue_private/functions/record_row_history.sql'));
    await db.exec(await read('../schemas/public/functions/catalog_model_is_public.sql'));
    await db.exec(await read(v1File));
    await db.exec(await read(v2File));
    await db.exec(await read(digestFile));

    // A catalogue push queued before the migration still goes out once it has run.
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
        select ('00000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid, 'user' || n || '@example.com',
          case when n = 3 then '{"full_name": "Casey Jones"}'::jsonb else '{}'::jsonb end
        from generate_series(1, 7) n;
      insert into public.users (user_id, display_name)
        select ('00000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid, case n when 1 then 'Daniel' when 2 then 'Priya' else null end
        from generate_series(1, 7) n;
      insert into public.v2_labs values ('openai', 'OpenAI');
      insert into public.v2_models (model_slug, lab_slug, name) values ('openai/gpt-6-astra', 'openai', 'GPT-6 Astra'), ('openai/gpt-6-astra-pro', 'openai', 'GPT-6 Astra Pro');
    `);
    await asService(async () => {
        for (let n = 1; n <= 7; n += 1) {
            await db.query(`select public.register_mobile_push_device($1, $2, $3, 'android', 'UTC', 'Pixel', '2.0.0', 2)`, [user(n), `install-d${n}`, `ExponentPushToken[d${n}]`]);
        }
    });
    await db.exec(`
      insert into public.mobile_notification_preferences (user_id, enabled, daily_cap)
        select ('00000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid, true, 10 from generate_series(1, 7) n;
      insert into public.mobile_notification_rules (user_id, event_kinds) values
        ('${user(2)}', '{model_released,deprecation_announced}'), ('${user(7)}', '{model_released}');
      insert into public.catalogue_notification_events (kind, dedupe_key, model_slug, lab_slug, title, body, href, payload)
        values ('model_released', 'release:openai/gpt-6-astra', 'openai/gpt-6-astra', 'openai', 'OpenAI released GPT-6 Astra', 'See the details on Phaseo.',
          '/models/openai/gpt-6-astra', '{"modelName": "GPT-6 Astra", "labName": "OpenAI"}');
    `);
    await asService(async () => {
        for (const { id } of await rows('select id from public.catalogue_notification_events')) await db.query('select public.enqueue_mobile_push_deliveries($1)', [id]);
    });
    assert.equal((await one(`select count(*)::int n from public.mobile_push_deliveries`)).n, 2, 'd2 and d7 queue the release');

    await db.exec(v3);

    // Workspaces: Acme has an owner (u1, also in a personal workspace), admins (u2, u5, u6) and
    // members (u3, who creates a key, and u4). u7 is not in Acme.
    await db.exec(`
      insert into public.workspaces (id, name, owner_user_id) values ('${ACME}', 'Acme', '${user(1)}'), ('${SOLO}', 'Daniel''s workspace', '${user(1)}');
      insert into public.workspace_members (workspace_id, user_id, role) values
        ('${ACME}', '${user(1)}', 'owner'), ('${SOLO}', '${user(1)}', 'owner'), ('${ACME}', '${user(2)}', 'admin'), ('${ACME}', '${user(3)}', 'member'),
        ('${ACME}', '${user(4)}', 'member'), ('${ACME}', '${user(5)}', 'admin'), ('${ACME}', '${user(6)}', 'admin');
      insert into public.keys (id, workspace_id, name, created_by) values
        ('${KEY_CI}', '${ACME}', 'ci', '${user(3)}'), ('${KEY_PROD}', '${ACME}', 'prod', '${user(2)}'), ('${KEY_CHAT}', '${ACME}', '__chat_route_managed_key__', '${user(4)}');
    `);

    // The queued release still goes out, untouched by the workspace columns.
    await db.exec(`update public.mobile_push_deliveries set not_before = now() - interval '1 minute'`);
    let token = claimToken();
    let pushes = await byDevice(await claim(token));
    assert.deepEqual(Object.keys(pushes).sort(), ['d2', 'd7']);
    assert.deepEqual([pushes.d2.title, pushes.d2.category, pushes.d2.workspace_id, pushes.d2.workspace_name, pushes.d2.group_key],
        ['OpenAI released GPT-6 Astra', 'new-models', null, null, 'release:openai']);
    await sendAll(token, Object.values(pushes));

    // The first run only sets the cursors; nothing that happened before it is pushed.
    assert.deepEqual(await fanOut(), { captured: 0, lowBalanceRepeats: 0, events: 0, queued: 0, deferred: 0 });
    assert.equal((await one(`select count(*)::int n from public.workspace_notification_cursors`)).n, 2);

    // u5 is in quiet hours now; u6 switched money off.
    await db.exec(`
      update public.mobile_notification_preferences set quiet_start = ((now() at time zone 'UTC') - interval '1 hour')::time,
        quiet_end = ((now() at time zone 'UTC') + interval '2 hours')::time where user_id = '${user(5)}';
      update public.mobile_notification_preferences set categories = '{"money": false}' where user_id = '${user(6)}';
    `);

    // Low balance: owners and admins only, the workspace named for u1 (two workspaces), quiet
    // hours deferring u5, and nothing for u6 (money off) or the members u3 and u4.
    await outbox('low_balance', { user_first_name: 'Dan', workspace_id: ACME, team_name: 'Acme', balance_nanos: 3_200_000_000, balance_usd: 3.2, threshold_nanos: 5_000_000_000, threshold_usd: 5 });
    assert.deepEqual(await fanOut(), { captured: 1, lowBalanceRepeats: 0, events: 1, queued: 2, deferred: 1 });
    const lowEvent = await one(`select kind, category, payload ? 'user_first_name' as has_name from public.workspace_notification_events`);
    assert.deepEqual(lowEvent, { kind: 'low_balance', category: 'money', has_name: false });
    assert.ok((await one(`select bool_and(not_before > now() + interval '119 minutes') ok from public.mobile_push_deliveries where status = 'deferred'`)).ok,
        'u5 hears when quiet hours end');
    token = claimToken();
    pushes = await byDevice(await claim(token));
    assert.deepEqual(Object.keys(pushes).sort(), ['d1', 'd2']);
    assert.deepEqual({ ...pushes.d1, id: null }, {
        id: null, attempts: 1, expo_push_token: 'ExponentPushToken[d1]', channel_scheme: 2, kind: 'low_balance', category: 'money', model_slug: null,
        title: 'Acme: balance is $3.20', body: 'Below your $5.00 alert. Add credits to keep requests running.', href: '/settings/credits',
        group_key: null, group_count: null, tag: null, deliveries: 1, workspace_id: ACME, workspace_name: 'Acme',
    });
    assert.equal(pushes.d2.title, 'Balance is $3.20', 'u2 is only in Acme, so the workspace is not named');
    assert.deepEqual(await sendAll(token, Object.values(pushes)), { sent: 2, retrying: 0, failed: 0, invalidated: 0 });

    // Six hours later the email repeats while the balance is still low: no push. A top-up that
    // leaves it below the threshold does not re-arm it either.
    await outbox('low_balance', { balance_nanos: 1_000_000_000, threshold_nanos: 5_000_000_000 });
    await db.query(`insert into public.credit_ledger (workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos) values ($1, 'top_up', 2000000000, 1000000000, 3000000000)`, [ACME]);
    await outbox('low_balance', { balance_nanos: 2_500_000_000, threshold_nanos: 5_000_000_000 });
    assert.deepEqual(await fanOut(), { captured: 0, lowBalanceRepeats: 2, events: 0, queued: 0, deferred: 0 });
    assert.deepEqual(await fanOut(), { captured: 0, lowBalanceRepeats: 2, events: 0, queued: 0, deferred: 0 }, 'reading the overlap again decides the same');
    // A top-up lifts it above the threshold; the next drop is pushed once.
    await db.query(`insert into public.credit_ledger (workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos) values ($1, 'top_up', 20000000000, 2500000000, 22500000000)`, [ACME]);
    await outbox('low_balance', { balance_nanos: 4_990_000_000, threshold_nanos: 5_000_000_000 });
    await outbox('low_balance', { balance_nanos: 4_000_000_000, threshold_nanos: 5_000_000_000 });
    assert.deepEqual(await fanOut(), { captured: 1, lowBalanceRepeats: 3, events: 1, queued: 2, deferred: 1 });
    token = claimToken();
    pushes = await byDevice(await claim(token));
    assert.deepEqual([Object.keys(pushes).sort(), pushes.d2.title], [['d1', 'd2'], 'Balance is $4.99']);
    await sendAll(token, Object.values(pushes));
    // A new threshold is a new alert.
    await outbox('low_balance', { balance_nanos: 4_000_000_000, threshold_nanos: 10_000_000_000 });
    assert.deepEqual(await fanOut(), { captured: 1, lowBalanceRepeats: 3, events: 1, queued: 2, deferred: 1 });
    token = claimToken();
    pushes = await byDevice(await claim(token));
    assert.equal(pushes.d2.body, 'Below your $10.00 alert. Add credits to keep requests running.');
    await sendAll(token, Object.values(pushes));

    // Key activity. A member's key: they hear about it ("You …"), as do owners and admins with the
    // actor's name; u4, another member, does not. The web chat's own key is never pushed.
    await audit(user(3), 'api_key.created', KEY_CI, 'ci', { prefix: 'sk_ci', status: 'active' });
    await audit(user(2), 'api_key.created', KEY_PROD, 'prod', { prefix: 'sk_prod', status: 'active' });
    await audit(user(4), 'api_key.created', KEY_CHAT, '__chat_route_managed_key__', {});
    await audit(user(4), 'api_key.updated', KEY_CI, 'ci', { changedFields: ['name'] });
    assert.deepEqual(await fanOut(), { captured: 2, lowBalanceRepeats: 3, events: 2, queued: 7, deferred: 2 });
    token = claimToken();
    const keyPushes = await claim(token);
    const titles = (await rows(`
      select d.installation_id as device, x.message ->> 'title' as title, x.message ->> 'body' as body, x.status
      from public.mobile_push_deliveries x join public.mobile_push_devices d on d.id = x.device_id
      where x.workspace_event_id in (select id from public.workspace_notification_events where kind = 'api_key_created')
      `)).map(row => `${row.device.slice(8)} ${row.status}: ${row.title} | ${row.body}`).sort();
    assert.deepEqual(titles, [
        "d1 processing: Acme: new API key 'ci' created by Casey Jones | Review your keys if you didn't expect this.",
        "d1 processing: Acme: new API key 'prod' created by Priya | Review your keys if you didn't expect this.",
        "d2 processing: New API key 'ci' created by Casey Jones | Review your keys if you didn't expect this.",
        "d5 deferred: New API key 'ci' created by Casey Jones | Review your keys if you didn't expect this.",
        "d6 processing: New API key 'ci' created by Casey Jones | Review your keys if you didn't expect this.",
        "d5 deferred: New API key 'prod' created by Priya | Review your keys if you didn't expect this.",
        "d6 processing: New API key 'prod' created by Priya | Review your keys if you didn't expect this.",
        "d3 processing: You created API key 'ci' | Owners and admins get this alert too.",
        "d2 processing: You created API key 'prod' | Owners and admins get this alert too.",
    ].sort());
    assert.ok(keyPushes.every(push => push.category === 'security' && push.href === '/settings/keys' && push.workspace_id === ACME));
    await sendAll(token, keyPushes);

    // An exposed key goes out at once, even in quiet hours: one push per device though the email
    // has a row per recipient, and to the key's creator too.
    await db.query(`insert into public.email_outbox (kind, to_email, workspace_id, user_id, payload) values
      ('security_leaked_key', 'u1@example.com', $1, $2, $4), ('security_leaked_key', 'u2@example.com', $1, $3, $4)`,
    [ACME, user(1), user(2), JSON.stringify({ key_type: 'api_key', key_id: KEY_CI, key_name: 'ci', key_preview: 'sk_ci…abcd', reported_source: 'github_secret_scanning', auto_revoked: true })]);
    assert.deepEqual(await fanOut(), { captured: 1, lowBalanceRepeats: 3, events: 1, queued: 5, deferred: 0 });
    token = claimToken();
    pushes = await byDevice(await claim(token));
    assert.deepEqual(Object.keys(pushes).sort(), ['d1', 'd2', 'd3', 'd5', 'd6']);
    assert.deepEqual([pushes.d5.title, pushes.d5.body, pushes.d5.category, pushes.d5.href],
        ["API key 'ci' was exposed", 'Reported by GitHub. It has been revoked, so replace it.', 'security', '/settings/keys']);
    assert.equal(pushes.d1.title, "Acme: API key 'ci' was exposed", 'a title that starts with a name keeps its case');
    await sendAll(token, Object.values(pushes));

    // Categories off: u1 switches security off. Queued key pushes are closed at claim, and new
    // ones are not queued. Rotation, pausing and deletion read as written.
    await audit(user(2), 'api_key.rotated', KEY_PROD, 'prod', { replacementKeyId: KEY_CI, replacementKeyName: 'prod (rotated)', previousKeyExpiresAt: '2026-10-21T14:00:00Z' });
    assert.deepEqual(await fanOut(), { captured: 1, lowBalanceRepeats: 3, events: 1, queued: 3, deferred: 1 });
    await db.exec(`update public.mobile_notification_preferences set categories = '{"security": false}' where user_id = '${user(1)}'`);
    await audit(user(1), 'api_key.paused', KEY_CI, 'ci');
    await audit(user(1), 'api_key.resumed', KEY_CI, 'ci');
    await audit(user(1), 'api_key.deleted', KEY_CI, 'ci');
    assert.deepEqual(await fanOut(), { captured: 3, lowBalanceRepeats: 3, events: 3, queued: 9, deferred: 3 });
    token = claimToken();
    pushes = await claim(token);
    assert.deepEqual(await rows(`select status, error_code from public.mobile_push_deliveries where device_id = (select id from public.mobile_push_devices where installation_id = 'install-d1') and status not in ('sent')`),
        [{ status: 'suppressed', error_code: 'category_disabled' }]);
    const keyTexts = pushes.filter(push => push.expo_push_token === 'ExponentPushToken[d3]').map(push => `${push.title} | ${push.body}`).sort();
    assert.deepEqual(keyTexts, [
        "API key 'ci' deleted by Daniel | Requests using it are now rejected.",
        "API key 'ci' paused by Daniel | Requests using it are rejected until it's resumed.",
        "API key 'ci' resumed by Daniel | It can make requests again.",
    ], 'u3 hears about their own key, and not about prod');
    assert.deepEqual(pushes.filter(push => push.expo_push_token === 'ExponentPushToken[d2]').map(push => `${push.title} | ${push.body}`).sort()[3],
        "You rotated API key 'prod' | The new key is 'prod (rotated)'. The old one stops working Oct 21, 14:00 UTC.");
    await sendAll(token, pushes);

    // The daily cap is for catalogue news. u2 has a cap of 2 and was sent one release plus many
    // workspace pushes today; a catalogue deprecation still gets through, and workspace pushes
    // keep coming after the cap is reached.
    await db.exec(`update public.mobile_notification_preferences set daily_cap = 2 where user_id = '${user(2)}'`);
    assert.ok((await one(`select count(*)::int n from public.mobile_push_deliveries where device_id = (select id from public.mobile_push_devices where installation_id = 'install-d2') and status = 'sent'`)).n > 2);
    await db.exec(`insert into public.catalogue_notification_events (kind, dedupe_key, title, body, href) values
      ('deprecation_announced', 'deprecation:a', 'Old model is deprecated', 'Switch soon.', '/'), ('deprecation_announced', 'deprecation:b', 'Older model is deprecated', 'Switch soon.', '/')`);
    const capped = [];
    await asService(async () => {
        for (const { id } of await rows(`select id from public.catalogue_notification_events where kind = 'deprecation_announced' order by dedupe_key`)) {
            capped.push((await one('select public.enqueue_mobile_push_deliveries($1) r', [id])).r);
        }
    });
    assert.deepEqual(capped, [{ queued: 1, deferred: 0, suppressed: 0 }, { queued: 0, deferred: 0, suppressed: 1 }], 'the second deprecation reaches the cap of 2');
    await outbox('auto_top_up_failed', { workspace_name: 'Acme', reason: 'Your card was declined.' });
    assert.deepEqual(await fanOut(), { captured: 1, lowBalanceRepeats: 3, events: 1, queued: 2, deferred: 1 }, 'd1 and d2 queue it; d5 waits; d6 has money off');
    token = claimToken();
    pushes = await byDevice(await claim(token));
    assert.deepEqual([pushes.d2.kind, pushes.d2.title, pushes.d2.body, pushes.d1.title],
        ['auto_top_up_failed', 'Auto top-up failed', 'Your card was declined.', 'Acme: auto top-up failed']);
    await sendAll(token, Object.values(pushes));

    // A member who has left the workspace is not sent what was queued for them.
    await outbox('rate_limit_throttled', { workspace_name: 'Acme', throttled_requests: 1234, window_minutes: 15, policies: [{ policy_name: 'Free tier', throttled_requests: 1200 }, { policy_name: 'Batch', throttled_requests: 34 }] });
    assert.deepEqual(await fanOut(), { captured: 1, lowBalanceRepeats: 3, events: 1, queued: 3, deferred: 1 });
    await db.exec(`delete from public.workspace_members where workspace_id = '${ACME}' and user_id = '${user(6)}'`);
    token = claimToken();
    pushes = await byDevice(await claim(token));
    assert.deepEqual(Object.keys(pushes).sort(), ['d1', 'd2']);
    assert.deepEqual([pushes.d2.title, pushes.d2.body, pushes.d2.category, pushes.d2.href],
        ['Rate limits blocked 1,234 requests', "In the last 15 minutes. Most were under 'Free tier'.", 'traffic', '/settings/usage/overview']);
    assert.deepEqual(await one(`select status, error_code from public.mobile_push_deliveries where device_id = (select id from public.mobile_push_devices where installation_id = 'install-d6') order by created_at desc limit 1`),
        { status: 'suppressed', error_code: 'not_a_member' });
    await sendAll(token, Object.values(pushes));

    // Quiet hours over: u5's deferred pushes go out, not counted against any cap.
    await db.exec(`update public.mobile_push_deliveries set not_before = now() - interval '1 minute' where status = 'deferred'`);
    pushes = await claim(claimToken());
    assert.ok(pushes.length >= 6 && pushes.every(push => push.expo_push_token === 'ExponentPushToken[d5]'), 'every deferred workspace push is sent');

    // Text for the other kinds.
    assert.deepEqual(await message('payment_method_expiring', 'money', { brand: 'american_express', last4: '0005', expiry: '11/2026' }, false, 'Acme'), {
        kind: 'payment_method_expiring', category: 'money', title: 'Acme: card ending 0005 expires soon',
        body: 'Your American Express expires 11/2026. Update it to keep top-ups working.', href: '/settings/payment-methods', modelSlug: null,
    });
    assert.deepEqual(await message('model_deprecation', 'deprecations', {
        model_id: 'openai/gpt-4o', model_name: 'GPT-4o', deprecation_date: '2026-01-01T00:00:00Z', retirement_date: '2099-11-30T00:00:00Z', replacement_model_name: 'GPT-6 Astra',
    }, false, 'Acme'), {
        kind: 'model_deprecation', category: 'deprecations', title: 'Acme: GPT-4o retires Nov 30', body: 'Switch to GPT-6 Astra before then.',
        href: '/models/openai/gpt-4o', modelSlug: 'openai/gpt-4o',
    });
    assert.equal((await message('model_deprecation', 'deprecations', { model_id: 'x/y', model_name: 'Y' })).title, 'Y is deprecated');
    assert.deepEqual(await message('model_substitution', 'traffic', {
        model_id: 'openai/gpt-4o', model_name: 'GPT-4o', replacement_model_id: 'openai/gpt-6-astra', replacement_model_name: 'GPT-6 Astra',
    }), {
        kind: 'model_substitution', category: 'traffic', title: 'GPT-4o requests now go to GPT-6 Astra', body: 'No provider serves GPT-4o any more.',
        href: '/models/openai/gpt-6-astra', modelSlug: 'openai/gpt-6-astra',
    });
    assert.equal((await message('api_key_created', 'security', { key_name: 'Phaseo CLI', actor_name: 'Daniel', app_name: 'Phaseo CLI' })).body, 'Issued to Phaseo CLI through OAuth.');
    assert.equal((await message('api_key_created', 'security', { key_name: 'x'.repeat(60) })).title, `New API key '${'x'.repeat(39)}…' created`);
    assert.equal((await message('security_leaked_key', 'security', { key_type: 'management_key', key_name: 'ops' })).href, '/settings/management-api-keys');
    assert.deepEqual(await message('budget_warning', 'money', { push: { title: 'About 80% of the monthly budget used', body: '$80.00 of $100.00.', href: '/settings/usage/overview', lowerLead: true } }, false, 'Acme'), {
        kind: 'budget_warning', category: 'money', title: 'Acme: about 80% of the monthly budget used', body: '$80.00 of $100.00.', href: '/settings/usage/overview', modelSlug: null,
    }, 'kinds written elsewhere carry their own text');
    assert.equal(await message('something_else', 'money', {}), null);

    // Idle: nothing new, so nothing is captured, queued or written apart from the cursors.
    const before = await one(`select (select count(*) from public.workspace_notification_events)::int events, (select count(*) from public.mobile_push_deliveries)::int deliveries`);
    assert.deepEqual(await fanOut(), { captured: 0, lowBalanceRepeats: 3, events: 0, queued: 0, deferred: 0 });
    await db.exec(`update public.workspace_notification_cursors set read_until = now() - interval '1 hour'`);
    assert.deepEqual((await fanOut()).captured, 0, 'reading an hour again captures nothing twice');
    assert.deepEqual(await one(`select (select count(*) from public.workspace_notification_events)::int events, (select count(*) from public.mobile_push_deliveries)::int deliveries`), before);

    // Events more than two days old are closed without sending.
    await db.query(`insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, payload, occurred_at) values ($1, 'auto_top_up_failed', 'money', 'old', '{}', now() - interval '3 days')`, [ACME]);
    assert.deepEqual(await fanOut(), { captured: 0, lowBalanceRepeats: 3, events: 1, queued: 0, deferred: 0 });

    // Backend only.
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query('select public.fan_out_workspace_push_events(10)'), /permission denied/);
        await assert.rejects(db.query('select * from public.workspace_notification_events'), /permission denied/);
        await db.exec('reset role');
    }
    console.log('mobile push workspace alerts: ok');
} finally {
    await db.close();
}
