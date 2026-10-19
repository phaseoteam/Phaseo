// Standalone PostgreSQL regression test for the weekly "Your Phaseo week" digest. Install
// @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its dist/index.js
// file URL. Run: node supabase/tests/mobile-push-digest.test.mjs
// Set MOBILE_PUSH_DIGEST_TIMINGS=1 to also print idle timings over 20,000 delivery rows.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const v1File = '../migrations/20261018135417_mobile_push_rules.sql';
const v2File = '../migrations/20261019170840_mobile_push_categories_and_grouping.sql';
const digestFile = '../migrations/20261019175553_mobile_push_weekly_digest.sql';
const schemaFiles = [
    '../schemas/public/tables/mobile_push_digests.sql',
    '../schemas/private/functions/mobile_push_digest_week.sql',
    '../schemas/private/functions/mobile_iso_week_monday.sql',
    '../schemas/private/functions/mobile_push_compact_number.sql',
    '../schemas/private/functions/mobile_push_digest_message.sql',
    '../schemas/private/functions/mobile_week_usage.sql',
    '../schemas/private/functions/mobile_week_releases.sql',
    '../schemas/private/functions/mobile_push_digest_facts.sql',
    '../schemas/private/functions/build_mobile_push_digests.sql',
    '../schemas/public/functions/enqueue_mobile_push_deliveries.sql',
    '../schemas/public/functions/claim_mobile_push_deliveries.sql',
    '../schemas/public/functions/claim_mobile_push_digests.sql',
    '../schemas/public/functions/get_mobile_week_summary.sql',
];
// Every file but enqueue and the catalogue claim (which changed) is new.
const newFiles = schemaFiles.filter(file => !/enqueue_mobile_push_deliveries|claim_mobile_push_deliveries/.test(file));
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const asService = async fn => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const id = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = n => id('00000000', n);
const workspace = n => id('10000000', n);
let claims = 0;
const claimToken = () => id('30000000', ++claims);
const claim = (at, limit = 100) => asService(async () => (await one('select public.claim_mobile_push_digests($1, $2, $3) r', [limit, claimToken(), at])).r);
const complete = (pushes, status = 'sent') => asService(async () => {
    const tokens = [...new Set(pushes.map(push => push.claimToken))];
    const results = {};
    for (const token of tokens) {
        const batch = pushes.filter(push => push.claimToken === token).map(push => ({ id: push.id, status, ...(status === 'sent' ? { ticketId: `ticket-${push.id}` } : { errorCode: 'MessageRateExceeded' }) }));
        results[token] = (await one('select public.complete_mobile_push_deliveries($1, $2) r', [token, JSON.stringify(batch)])).r;
    }
    return results;
});
// claim() with the claim token kept on each push, so complete() can answer under it.
const claimPushes = async (at, limit) => {
    const token = id('30000000', claims + 1);
    const result = await claim(at, limit);
    return { ...result, pushes: result.pushes.map(push => ({ ...push, claimToken: token })) };
};
const week = (zone, at) => one('select due, iso_week, week_start, week_cutoff from private.mobile_push_digest_week($1, $2)', [zone, at]);
const digestOf = n => one(`select status, iso_week, workspace_id, title, body, href, summary from public.mobile_push_digests where user_id = $1 order by created_at desc limit 1`, [user(n)]);
const deliveriesOf = n => rows(`select x.status, x.not_before, x.error_code, x.workspace_id, dev.installation_id from public.mobile_push_deliveries x
  join public.mobile_push_devices dev on dev.id = x.device_id where x.user_id = $1 and x.digest_id is not null order by dev.installation_id`, [user(n)]);
const iso = value => new Date(value).toISOString();

try {
    // The migration carries every schema file it changed, and the manifest lists the new ones.
    const v1 = await read(v1File);
    const v2 = await read(v2File);
    const migration = await read(digestFile);
    for (const file of schemaFiles) assert.ok(migration.includes((await read(file)).trim()), `${file} is in the migration`);
    const deliveriesTable = await read('../schemas/public/tables/mobile_push_deliveries.sql');
    const eventsTable = await read('../schemas/public/tables/catalogue_notification_events.sql');
    for (const [table, start] of [
        [deliveriesTable, 'CREATE UNIQUE INDEX mobile_push_deliveries_digest_device_key'],
        [deliveriesTable, 'CREATE INDEX mobile_push_deliveries_digest_due_idx'],
        [deliveriesTable, 'COMMENT ON COLUMN "public"."mobile_push_deliveries"."digest_id"'],
        [deliveriesTable, 'COMMENT ON TABLE "public"."mobile_push_deliveries"'],
        [eventsTable, 'CREATE INDEX catalogue_notification_events_releases_idx'],
    ]) {
        const at = table.indexOf(start);
        assert.ok(at >= 0, `${start} is declared`);
        const statement = table.slice(at, table.indexOf(';\n', at) + 1);
        assert.ok(migration.includes(statement), `the migration carries ${start}`);
    }
    for (const text of [
        '"event_id"           uuid,\n',
        '"workspace_id"       uuid,\n',
        '"digest_id"          uuid,\n',
        'CONSTRAINT "mobile_push_deliveries_digest_id_fkey" FOREIGN KEY (digest_id) REFERENCES public.mobile_push_digests(id) ON DELETE CASCADE',
    ]) assert.ok(deliveriesTable.includes(text), `mobile_push_deliveries.sql declares ${text.trim()}`);
    assert.match(migration, /ALTER COLUMN "event_id" DROP NOT NULL/);
    // Added the way the parallel workspace-alerts change adds it, so either can land first.
    assert.match(migration, /ADD COLUMN IF NOT EXISTS "workspace_id" uuid,/);
    assert.match(migration, /FOREIGN KEY \(digest_id\) REFERENCES public\.mobile_push_digests\(id\) ON DELETE CASCADE;/);
    const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
    for (const file of newFiles) {
        const path = file.replace('../schemas/', '');
        for (const list of ['loadOrder', 'files']) assert.ok(manifest[list].includes(path), `${path} is in the manifest's ${list}`);
    }
    assert.ok(!/\b(drop\s+(table|schema|type|view|column)|truncate|delete\s+from)\b/i.test(migration), 'the migration is not destructive');

    // Production objects the migrations use, trimmed: the catalogue as in mobile-push-v2.test.mjs,
    // workspaces, and the usage tables behind get_private_usage_overview.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create schema auth; create schema private; create schema catalogue_private;
      grant usage on schema private to service_role;
      set timezone = 'UTC';
      create table auth.users (id uuid primary key);
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
      create table public.workspaces (
        id uuid primary key, name text not null, owner_user_id uuid not null references auth.users, created_at timestamptz not null default now()
      );
      create table public.workspace_members (
        workspace_id uuid not null references public.workspaces on delete cascade, user_id uuid not null references auth.users,
        role public.workspace_role not null, last_accessed_at timestamptz, primary key (workspace_id, user_id)
      );
      create table public.v2_request_facts (
        request_event_id uuid primary key, workspace_id uuid, occurred_at timestamptz, app_id uuid, key_id uuid,
        endpoint text, requested_model_input text, requested_model_slug text, routed_model_slug text,
        provider_model_id text, success boolean, error_code text, byok boolean, safe_metadata jsonb, cost_nanos bigint
      );
      create table public.v2_request_usage (request_event_id uuid, meter_key text, quantity numeric(30,12), sequence integer default 0);
      create table public.keys (id uuid primary key, workspace_id uuid, created_by uuid);
      create table public.v2_analytics_outbox (request_event_id uuid primary key, workspace_id uuid, occurred_at timestamptz, status text);
      grant select on public.v2_request_facts, public.v2_request_usage, public.v2_model_provider_routes, public.keys, public.v2_analytics_outbox to service_role;
    `);
    await db.exec(await read('../schemas/private/tables/v2_analytics_previous_grains.sql'));
    await db.exec((await read('../schemas/public/tables/v2_private_usage_15m.sql')).replace(/,\r?\n  CONSTRAINT "v2_private_usage_15m_workspace_id_fkey"[^\r\n]*/, ''));
    await db.exec((await read('../schemas/public/tables/v2_private_usage_labels_15m.sql')).replace(/,\r?\n  CONSTRAINT "v2_private_usage_labels_15m_workspace_id_fkey"[^\r\n]*/, ''));
    await db.exec(await read('../schemas/private/views/v2_usage_overview_requests.sql'));
    await db.exec(await read('../schemas/public/functions/get_private_usage_overview.sql'));
    await db.exec(await read('../schemas/catalogue_private/functions/history_model.sql'));
    await db.exec(await read('../schemas/catalogue_private/functions/record_row_history.sql'));
    for (const table of ['v2_models', 'v2_model_provider_routes', 'v2_pricing_skus', 'v2_pricing_sku_meters']) {
        await db.exec(`create trigger catalogue_row_history after insert or update or delete on public.${table} for each row execute function catalogue_private.record_row_history()`);
    }
    await db.exec(await read('../schemas/public/functions/catalog_model_is_public.sql'));
    await db.exec(v1);
    await db.exec(v2);
    await db.exec(migration);

    // People. u1 owns Acme and administers Beta and Gamma; it is only a member of Delta, which is
    // busy. u2 has one workspace (New York), u3 a quiet one (Tokyo) and rules for OpenAI only, u4
    // nothing at all, u5 is only a member, u6 switched the digest off, u7 runs an old app build,
    // u8 has a device in a time zone the database does not know, u10 has quiet hours.
    await db.exec(`
      insert into auth.users select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 11) n;
      insert into public.workspaces (id, name, owner_user_id, created_at) values
        ('${workspace(1)}', 'Acme', '${user(1)}', '2026-01-01'), ('${workspace(2)}', 'Beta', '${user(8)}', '2026-01-02'),
        ('${workspace(3)}', 'Gamma', '${user(8)}', '2026-01-03'), ('${workspace(4)}', 'Delta', '${user(8)}', '2026-01-04'),
        ('${workspace(5)}', 'Solo', '${user(2)}', '2026-01-05'), ('${workspace(6)}', 'Quiet', '${user(3)}', '2026-01-06'),
        ('${workspace(7)}', 'Empty', '${user(4)}', '2026-01-07'), ('${workspace(8)}', 'Off', '${user(6)}', '2026-01-08'),
        ('${workspace(9)}', 'Old', '${user(7)}', '2026-01-09'), ('${workspace(10)}', 'Night', '${user(10)}', '2026-01-10');
      insert into public.workspace_members (workspace_id, user_id, role) values
        ('${workspace(1)}', '${user(1)}', 'owner'), ('${workspace(2)}', '${user(1)}', 'admin'), ('${workspace(3)}', '${user(1)}', 'admin'),
        ('${workspace(4)}', '${user(1)}', 'member'), ('${workspace(1)}', '${user(5)}', 'member');
      insert into public.v2_labs values ('anthropic', 'Anthropic'), ('openai', 'OpenAI'), ('mistral', 'Mistral'), ('deepseek', 'DeepSeek');
      insert into public.v2_providers values ('openai', 'OpenAI');
      insert into public.v2_models (model_slug, lab_slug, name, hidden) values
        ('anthropic/claude-sonnet-5.5', 'anthropic', 'Claude Sonnet 5.5', false), ('openai/gpt-6-astra', 'openai', 'GPT-6 Astra', false),
        ('openai/gpt-6-astra-pro', 'openai', 'GPT-6 Astra Pro', false), ('openai/gpt-6-mini', 'openai', 'GPT-6 Mini', false),
        ('mistral/large-4', 'mistral', 'Mistral Large 4', false), ('deepseek/v5', 'deepseek', 'DeepSeek V5', false),
        ('openai/secret', 'openai', 'Secret', true), ('openai/gpt-6-nano', 'openai', 'GPT-6 Nano', false);
    `);
    await asService(async () => {
        for (const [n, name, zone, scheme] of [
            [1, 'u1-phone', 'Europe/London', 2], [1, 'u1-tablet', 'Europe/London', 2], [2, 'u2', 'America/New_York', 2],
            [3, 'u3', 'Asia/Tokyo', 2], [4, 'u4', 'Europe/London', 2], [5, 'u5', 'Europe/London', 2], [6, 'u6', 'Europe/London', 2],
            [7, 'u7', 'Europe/London', 1], [8, 'u8', 'Mars/Olympus_Mons', 2], [10, 'u10', 'Europe/London', 2],
        ]) {
            await db.query(`select public.register_mobile_push_device($1, $2, $3, 'android', $4, 'Pixel', '2.0.0', $5)`,
                [user(n), `install-${name}`, `ExponentPushToken[${name}]`, zone, scheme]);
        }
    });
    // Registration stores null (UTC) for a zone the database cannot read, but a zone stored before
    // a time zone data change can still be unknown later.
    await db.exec(`update public.mobile_push_devices set time_zone = 'Mars/Olympus_Mons' where installation_id = 'install-u8'`);
    const releases = '{model_released,gateway_available}';
    await db.exec(`
      insert into public.mobile_notification_preferences (user_id, enabled, categories, quiet_start, quiet_end)
        select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, true,
          case when n = 6 then '{"digest": false}'::jsonb else '{}'::jsonb end,
          case when n = 10 then '17:00'::time end, case when n = 10 then '09:00'::time end
        from generate_series(1, 10) n;
      insert into public.mobile_notification_rules (user_id, event_kinds, lab_mode, lab_slugs) values
        ('${user(1)}', '${releases}', 'all', '{}'), ('${user(2)}', '${releases}', 'all', '{}'), ('${user(3)}', '${releases}', 'only', '{openai}'),
        ('${user(4)}', '${releases}', 'only', '{nobody}'), ('${user(5)}', '${releases}', 'all', '{}'), ('${user(6)}', '${releases}', 'all', '{}'),
        ('${user(7)}', '${releases}', 'all', '{}'), ('${user(8)}', '${releases}', 'all', '{}');
      -- u1 mutes Mistral, and also follows price changes.
      insert into public.mobile_notification_rules (user_id, action, event_kinds, lab_mode, lab_slugs) values
        ('${user(1)}', 'mute', '{model_released}', 'only', '{mistral}'), ('${user(1)}', 'notify', '{price_changed}', 'all', '{}');
      -- Releases in week 43: three OpenAI models (one also reaching Phaseo later), Mistral and
      -- DeepSeek; a hidden model, and a release the week before, never count.
      insert into public.catalogue_notification_events (kind, dedupe_key, model_slug, lab_slug, title, body, href, payload, occurred_at, fanned_out_at) values
        ('model_released', 'r1', 'openai/gpt-6-astra', 'openai', 'OpenAI released GPT-6 Astra', 'b', '/models/openai/gpt-6-astra', '{"modelName": "GPT-6 Astra", "labName": "OpenAI"}', '2026-10-20 10:00Z', now()),
        ('model_released', 'r2', 'openai/gpt-6-astra-pro', 'openai', 'OpenAI released GPT-6 Astra Pro', 'b', '/models/openai/gpt-6-astra-pro', '{"modelName": "GPT-6 Astra Pro"}', '2026-10-21 10:00Z', now()),
        ('gateway_available', 'r3', 'openai/gpt-6-mini', 'openai', 'GPT-6 Mini is now on Phaseo', 'b', '/models/openai/gpt-6-mini', '{"modelName": "GPT-6 Mini"}', '2026-10-22 10:00Z', now()),
        ('gateway_available', 'r4', 'openai/gpt-6-astra', 'openai', 'GPT-6 Astra is now on Phaseo', 'b', '/models/openai/gpt-6-astra', '{}', '2026-10-22 11:00Z', now()),
        ('model_released', 'r5', 'mistral/large-4', 'mistral', 'Mistral released Large 4', 'b', '/models/mistral/large-4', '{"modelName": "Mistral Large 4"}', '2026-10-23 10:00Z', now()),
        ('model_released', 'r6', 'deepseek/v5', 'deepseek', 'DeepSeek released V5', 'b', '/models/deepseek/v5', '{"modelName": "DeepSeek V5"}', '2026-10-24 10:00Z', now()),
        ('model_released', 'r7', 'openai/secret', 'openai', 'OpenAI released Secret', 'b', '/models/openai/secret', '{}', '2026-10-22 12:00Z', now()),
        ('model_released', 'r8', 'openai/gpt-6-nano', 'openai', 'OpenAI released GPT-6 Nano', 'b', '/models/openai/gpt-6-nano', '{}', '2026-10-15 10:00Z', now());
    `);

    // Usage, in requests the usage overview reads. London's week 43 runs from 23:00 UTC on
    // 18 October (midnight BST) to 18:00 UTC on Sunday 25 October (GMT from 01:00 UTC that day).
    const requests = (ws, model, count, start, stepMinutes, costNanos, { input = 100000, output = 20000, failed = 0 } = {}) => db.exec(`
      with inserted as (
        insert into public.v2_request_facts (request_event_id, workspace_id, occurred_at, routed_model_slug, endpoint, success, error_code, cost_nanos, safe_metadata)
        select gen_random_uuid(), '${ws}', timestamptz '${start}' + make_interval(mins => i * ${stepMinutes}), '${model}', 'chat.completions',
          i >= ${failed}, case when i < ${failed} then 'upstream:upstream_error' end, ${costNanos}, '{}'
        from generate_series(0, ${count - 1}) i
        returning request_event_id
      )
      insert into public.v2_request_usage (request_event_id, meter_key, quantity)
      select request_event_id, meter, quantity from inserted, (values ('input_tokens', ${input}::numeric), ('output_tokens', ${output}::numeric)) m(meter, quantity)
      where quantity > 0;
    `);
    // Acme: 20 Claude requests ($1 each, two failed) and 10 GPT-6 Astra ($0.50) in the week, one
    // Claude request after the digest's Sunday 18:00, one before the week (23:30 BST on the 18th),
    // and 10 requests at $2.695 the week before.
    await requests(workspace(1), 'anthropic/claude-sonnet-5.5', 20, '2026-10-19 08:00Z', 360, 1e9, { failed: 2 });
    await requests(workspace(1), 'openai/gpt-6-astra', 10, '2026-10-24 10:00Z', 7, 5e8);
    await requests(workspace(1), 'anthropic/claude-sonnet-5.5', 1, '2026-10-25 19:00Z', 1, 1e9);
    await requests(workspace(1), 'openai/gpt-6-astra', 1, '2026-10-18 22:30Z', 1, 5e7);
    await requests(workspace(1), 'anthropic/claude-sonnet-5.5', 10, '2026-10-14 12:00Z', 30, 2695000000);
    await requests(workspace(2), 'openai/gpt-6-astra', 5, '2026-10-21 12:00Z', 60, 1e9);
    await requests(workspace(3), 'mistral/large-4', 2, '2026-10-22 12:00Z', 60, 9e7);
    await requests(workspace(4), 'openai/gpt-6-astra', 200, '2026-10-20 00:00Z', 30, 5e8);
    // Solo (New York): 1,234 DeepSeek requests at $0.034, and $50 the week before.
    await requests(workspace(5), 'deepseek/v5', 1234, '2026-10-19 12:00Z', 7, 34000000, { input: 8000, output: 2000 });
    await requests(workspace(5), 'deepseek/v5', 50, '2026-10-13 12:00Z', 30, 1e9);
    // Off and Night: a little usage each; Night's one request costs $0.004 and has no tokens.
    await requests(workspace(8), 'openai/gpt-6-astra', 3, '2026-10-21 12:00Z', 60, 1e9);
    await requests(workspace(10), 'openai/gpt-6-mini', 1, '2026-10-21 12:00Z', 1, 4000000, { input: 0, output: 0 });
    const rollup = await read('../migrations/20261015134806_private_usage_15m.sql');
    await db.exec(rollup.slice(rollup.indexOf('-- Backfill every request')));

    // The schedule: due from 18:00 on Sunday to 06:00 on Monday in each device's time zone, for the
    // ISO week up to that Sunday 18:00, on either side of UTC and across clock changes.
    const due = async (zone, at) => (await week(zone, at)).due;
    // London leaves BST at 01:00 UTC on 25 October, so week 43 is 169 hours long there.
    assert.equal(await due('Europe/London', '2026-10-25 17:59:59Z'), false);
    assert.deepEqual(await week('Europe/London', '2026-10-25 18:00Z'), {
        due: true, iso_week: '2026-W43', week_start: new Date('2026-10-18T23:00:00Z'), week_cutoff: new Date('2026-10-25T18:00:00Z'),
    });
    assert.equal(await due('Europe/London', '2026-10-26 05:59:59Z'), true, 'still due at 05:59 on Monday');
    assert.equal((await week('Europe/London', '2026-10-26 05:59:59Z')).iso_week, '2026-W43', 'for the week that just ended');
    assert.equal(await due('Europe/London', '2026-10-26 06:00Z'), false);
    // UTC+14 reaches Sunday 18:00 at 04:00 UTC; UTC-12 at 06:00 UTC on Monday, until 18:00 UTC.
    assert.equal(await due('Pacific/Kiritimati', '2026-10-25 03:59Z'), false);
    assert.deepEqual(await week('Pacific/Kiritimati', '2026-10-25 04:00Z'), {
        due: true, iso_week: '2026-W43', week_start: new Date('2026-10-18T10:00:00Z'), week_cutoff: new Date('2026-10-25T04:00:00Z'),
    });
    assert.equal(await due('Etc/GMT+12', '2026-10-26 05:59Z'), false);
    assert.equal(await due('Etc/GMT+12', '2026-10-26 06:00Z'), true);
    assert.equal(await due('Etc/GMT+12', '2026-10-26 17:59Z'), true);
    assert.equal(await due('Etc/GMT+12', '2026-10-26 18:00Z'), false);
    assert.equal(await due('Asia/Kathmandu', '2026-10-25 12:14Z'), false, 'UTC+5:45');
    assert.equal(await due('Asia/Kathmandu', '2026-10-25 12:15Z'), true);
    // New York leaves EDT on 1 November: Sunday 18:00 EST is 23:00 UTC, and week 44 began at
    // midnight EDT.
    assert.equal(await due('America/New_York', '2026-11-01 22:59Z'), false);
    assert.deepEqual(await week('America/New_York', '2026-11-01 23:00Z'), {
        due: true, iso_week: '2026-W44', week_start: new Date('2026-10-26T04:00:00Z'), week_cutoff: new Date('2026-11-01T23:00:00Z'),
    });
    // Sydney entered summer time on 4 October: week 40 began at midnight AEST and ends at AEDT.
    assert.deepEqual(await week('Australia/Sydney', '2026-10-04 07:00Z'), {
        due: true, iso_week: '2026-W40', week_start: new Date('2026-09-27T14:00:00Z'), week_cutoff: new Date('2026-10-04T07:00:00Z'),
    });
    assert.equal(await due('Australia/Sydney', '2026-10-04 06:59Z'), false);
    // ISO weeks round-trip, and 2025 has no week 53.
    for (const [label, monday] of [['2026-W43', '2026-10-19'], ['2026-W01', '2025-12-29'], ['2026-W53', '2026-12-28'], ['2025-W53', null], ['2026-W00', null], ['2026-43', null], ['abcd-W10', null]]) {
        const value = (await one('select private.mobile_iso_week_monday($1)::text d', [label])).d;
        assert.equal(value, monday, `${label} starts on ${monday}`);
    }
    // Compact numbers.
    const compact = async value => (await one('select private.mobile_push_compact_number($1) t', [value])).t;
    for (const [value, text] of [[0, '0'], [1, '1'], [12340, '12,340'], [99999, '99,999'], [123456, '123K'], [999499, '999K'], [999500, '1M'], [18200000, '18.2M'], [99960000, '100M'], [123456789, '123M'], [1234567890, '1.2B'], [123456789012, '123B']]) {
        assert.equal(await compact(value), text, `${value} reads ${text}`);
    }

    // Outside 04:00 UTC on Sunday to 18:00 UTC on Monday the build reads nothing at all.
    assert.deepEqual(await claim('2026-10-28 12:00Z'), { built: 0, skipped: 0, queued: 0, deferred: 0, more: false, closed: 0, pushes: [] });
    // Sunday 08:59 UTC: no device has reached 18:00 yet, and the unknown time zone breaks nothing.
    assert.deepEqual(await claim('2026-10-25 08:59Z'), { built: 0, skipped: 0, queued: 0, deferred: 0, more: false, closed: 0, pushes: [] });

    // 09:00 UTC is 18:00 in Tokyo: u3's quiet week, with OpenAI's three releases, newest first.
    const tokyo = await claimPushes('2026-10-25 09:00Z');
    assert.deepEqual({ ...tokyo, pushes: undefined }, { built: 1, skipped: 0, queued: 1, deferred: 0, more: false, closed: 0, pushes: undefined });
    assert.equal(tokyo.pushes.length, 1);
    assert.deepEqual({ ...tokyo.pushes[0], id: undefined, claimToken: undefined }, {
        id: undefined, claimToken: undefined, attempts: 1, expoPushToken: 'ExponentPushToken[u3]', channelScheme: 2,
        title: 'Your Phaseo week',
        body: 'A quiet week: 3 new models launched, including GPT-6 Mini and GPT-6 Astra Pro',
        href: `/account/week?workspace=${workspace(6)}&week=2026-W43`,
        tag: 'digest:2026-W43', isoWeek: '2026-W43', workspaceId: workspace(6), workspaceName: 'Quiet',
    });
    assert.deepEqual((await complete(tokyo.pushes))[tokyo.pushes[0].claimToken], { sent: 1, retrying: 0, failed: 0, invalidated: 0 });

    // 17:59:59 UTC: London is not there yet.
    assert.equal((await claim('2026-10-25 17:59:59Z')).built, 0);

    // The catalogue claim never sends a digest, whatever is waiting.
    await db.exec(`insert into public.mobile_push_digests (user_id, iso_week, time_zone, week_start, week_cutoff, status, workspace_id, title, body, href, created_at)
      values ('${user(8)}', '2026-W42', 'UTC', '2026-10-12Z', '2026-10-18 18:00Z', 'queued', '${workspace(2)}', 't', 'b', '/', now());
      insert into public.mobile_push_deliveries (digest_id, workspace_id, device_id, user_id, status, not_before, created_at)
      select g.id, g.workspace_id, d.id, d.user_id, 'pending', now() - interval '1 hour', '2026-10-25 17:00Z'
      from public.mobile_push_digests g join public.mobile_push_devices d on d.user_id = g.user_id where g.iso_week = '2026-W42';`);
    assert.deepEqual(await asService(() => rows('select * from public.claim_mobile_push_deliveries(500, $1)', [claimToken()])), []);
    assert.deepEqual(await rows(`select x.status from public.mobile_push_deliveries x join public.mobile_push_digests g on g.id = x.digest_id where g.iso_week = '2026-W42'`), [{ status: 'pending' }]);

    // 18:00 UTC is 18:00 in London (GMT since this morning). u1 gets one digest for both devices;
    // u4 has nothing to report; u10 is in quiet hours until 09:00; u5 (a member), u6 (digest off)
    // and u7 (old app) get nothing. The stray week-42 digest for u8 goes out too. A build that
    // reaches its limit (here one user, u1) says more are waiting; the next writes the rest.
    assert.deepEqual(await one(`select private.build_mobile_push_digests('2026-10-25 18:00Z', 1) r`), { r: { built: 1, skipped: 0, queued: 2, deferred: 0, more: true } });
    const london = await claimPushes('2026-10-25 18:00Z');
    assert.deepEqual({ ...london, pushes: undefined }, { built: 1, skipped: 1, queued: 0, deferred: 1, more: false, closed: 0, pushes: undefined });
    const u1 = await digestOf(1);
    assert.equal(u1.status, 'queued');
    assert.equal(u1.iso_week, '2026-W43');
    assert.equal(u1.title, 'Your Phaseo week: $30.18 spent, up 12%');
    assert.equal(u1.body, 'Acme and 2 other workspaces: 37 requests · 4.4M tokens · Top model: Claude Sonnet 5.5 · 4 new models launched');
    assert.equal(u1.href, `/account/week?workspace=${workspace(1)}&week=2026-W43`);
    assert.deepEqual(u1.summary.activeWorkspaces.map(ws => [ws.name, Number(ws.requests)]), [['Acme', 30], ['Beta', 5], ['Gamma', 2]], 'Delta, where u1 is only a member, is left out');
    assert.equal(u1.summary.workspaceCount, 3);
    assert.equal(Number(u1.summary.previousSpendNanos), 26950000000, 'the same span of week 42 only');
    assert.deepEqual(u1.summary.topModel, { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', requests: 20 });
    const u1Pushes = london.pushes.filter(push => push.workspaceId === workspace(1));
    assert.deepEqual(u1Pushes.map(push => push.expoPushToken).sort(), ['ExponentPushToken[u1-phone]', 'ExponentPushToken[u1-tablet]']);
    for (const push of u1Pushes) {
        assert.deepEqual([push.tag, push.isoWeek, push.workspaceName, push.title, push.body, push.href, push.channelScheme],
            ['digest:2026-W43', '2026-W43', 'Acme', u1.title, u1.body, u1.href, 2]);
    }
    assert.equal(london.pushes.length, 3, 'u1 twice and the stray week-42 digest');
    assert.equal((await digestOf(4)).status, 'skipped');
    assert.equal((await digestOf(4)).title, null);
    assert.deepEqual(await deliveriesOf(4), []);
    for (const n of [5, 6, 7, 8]) assert.equal((await rows(`select 1 from public.mobile_push_digests where user_id = $1 and iso_week = '2026-W43'`, [user(n)])).length, 0, `no digest for u${n}`);
    const u10 = await digestOf(10);
    assert.equal(u10.title, 'Your Phaseo week: under $0.01 spent');
    assert.equal(u10.body, '1 request · Top model: GPT-6 Mini');
    assert.deepEqual((await deliveriesOf(10)).map(row => [row.status, iso(row.not_before)]), [['deferred', '2026-10-26T09:00:00.000Z']]);

    // One push failed to reach Expo and is retried; the rest are sent.
    const [phone, tablet] = ['u1-phone', 'u1-tablet'].map(name => london.pushes.find(push => push.expoPushToken === `ExponentPushToken[${name}]`));
    const others = london.pushes.filter(push => push !== tablet);
    assert.deepEqual((await complete(others))[phone.claimToken], { sent: 2, retrying: 0, failed: 0, invalidated: 0 });
    assert.deepEqual((await complete([tablet], 'retry'))[tablet.claimToken], { sent: 0, retrying: 1, failed: 0, invalidated: 0 });

    // Five minutes on: nothing new is written, the retry goes out, and u10 is still held.
    const later = await claimPushes('2026-10-25 18:05Z');
    assert.deepEqual({ ...later, pushes: undefined }, { built: 0, skipped: 0, queued: 0, deferred: 0, more: false, closed: 0, pushes: undefined });
    assert.deepEqual(later.pushes.map(push => [push.expoPushToken, push.attempts]), [['ExponentPushToken[u1-tablet]', 2]]);
    await complete(later.pushes);

    // A new install the same week does not bring a second digest: one per user and ISO week.
    await asService(() => db.query(`select public.register_mobile_push_device($1, 'install-u1-new', 'ExponentPushToken[u1-new]', 'android', 'Europe/London', 'Pixel', '2.0.0', 2)`, [user(1)]));
    assert.equal((await claim('2026-10-25 19:00Z')).built, 0);
    assert.equal((await rows(`select 1 from public.mobile_push_digests where user_id = $1`, [user(1)])).length, 1);

    // Digests never use up the daily cap: with a cap of 1 and the digest sent within the day, u1's
    // next catalogue push still queues on every device. (Fan-out runs on the real clock, so the
    // digest rows are moved to it, and the event is a price change so no week counts it as a release.)
    await db.exec(`update public.mobile_notification_preferences set daily_cap = 1 where user_id = '${user(1)}';
      update public.mobile_push_deliveries set created_at = now() where user_id = '${user(1)}' and digest_id is not null;
      insert into public.catalogue_notification_events (kind, dedupe_key, model_slug, lab_slug, title, body, href, occurred_at)
      values ('price_changed', 'cap', 'openai/gpt-6-nano', 'openai', 'GPT-6 Nano prices changed', 'b', '/models/openai/gpt-6-nano', now());`);
    const capEvent = (await one(`select id from public.catalogue_notification_events where dedupe_key = 'cap'`)).id;
    await asService(() => db.query('select public.enqueue_mobile_push_deliveries($1)', [capEvent]));
    assert.deepEqual(await rows(`select dev.installation_id, x.status from public.mobile_push_deliveries x join public.mobile_push_devices dev on dev.id = x.device_id
      where x.event_id = $1 and x.user_id = $2 order by 1`, [capEvent, user(1)]), [
        { installation_id: 'install-u1-new', status: 'pending' }, { installation_id: 'install-u1-phone', status: 'pending' }, { installation_id: 'install-u1-tablet', status: 'pending' },
    ]);

    // 22:00 UTC is 18:00 EDT in New York: one workspace, so no workspace name, and spend fell.
    // u2 switches the digest off before it is sent: the push is closed, not sent.
    const newYork = await claimPushes('2026-10-25 21:59Z');
    assert.equal(newYork.built, 0);
    await db.exec(`update public.mobile_notification_preferences set categories = '{}' where user_id = '${user(2)}'`);
    const ny = await asService(async () => (await one(`select private.build_mobile_push_digests('2026-10-25 22:00Z', 10) r`).catch(error => ({ r: error.message }))).r);
    assert.match(String(ny), /permission denied/, 'the builder is not callable by the service role on its own');
    assert.deepEqual(await one(`select private.build_mobile_push_digests('2026-10-25 22:00Z', 10) r`), { r: { built: 1, skipped: 0, queued: 1, deferred: 0, more: false } });
    const u2 = await digestOf(2);
    assert.equal(u2.title, 'Your Phaseo week: $41.96 spent, down 16%');
    assert.equal(u2.body, '1,234 requests · 12.3M tokens · Top model: DeepSeek V5 · 5 new models launched');
    await db.exec(`update public.mobile_notification_preferences set categories = '{"digest": false}' where user_id = '${user(2)}'`);
    const closed = await claim('2026-10-25 22:05Z');
    assert.equal(closed.closed, 1);
    assert.deepEqual(closed.pushes, []);
    assert.deepEqual((await deliveriesOf(2)).map(row => [row.status, row.error_code]), [['suppressed', 'category_disabled']]);

    // u10's quiet hours end at 09:00 on Monday.
    assert.deepEqual((await claim('2026-10-26 08:59Z')).pushes, []);
    const morning = await claimPushes('2026-10-26 09:00Z');
    assert.deepEqual(morning.pushes.map(push => [push.expoPushToken, push.title, push.workspaceName]), [['ExponentPushToken[u10]', 'Your Phaseo week: under $0.01 spent', 'Night']]);
    await complete(morning.pushes);

    // Week 44 is a new week: u1 hears again on 1 November, from his three devices.
    const nextWeek = await claimPushes('2026-11-01 18:00Z');
    assert.equal((await digestOf(1)).iso_week, '2026-W44');
    assert.equal(nextWeek.pushes.filter(push => push.isoWeek === '2026-W44' && push.workspaceId === workspace(1)).length, 0, 'u1 had no usage or releases in week 44');
    assert.equal((await digestOf(1)).status, 'skipped');
    assert.equal((await rows(`select 1 from public.mobile_push_digests where user_id = $1`, [user(1)])).length, 2);

    // Rows left over two days are closed as expired.
    await db.exec(`update public.mobile_push_deliveries set status = 'pending', not_before = '2026-10-25 18:00Z' where user_id = '${user(10)}' and digest_id is not null`);
    const expired = await claim('2026-10-28 09:00Z');
    assert.equal(expired.closed, 1);
    assert.deepEqual((await deliveriesOf(10)).map(row => [row.status, row.error_code]), [['failed', 'expired']]);

    // The "Your week" screen: Acme's whole week 43 in London, opened on Monday.
    const summary = await asService(async () => (await one(`select public.get_mobile_week_summary($1, $2, '2026-W43', 'Europe/London', '2026-10-26 12:00Z') s`, [user(1), workspace(1)])).s);
    assert.equal(summary.week, '2026-W43');
    assert.equal(summary.timeZone, 'Europe/London');
    assert.deepEqual([summary.from, summary.to, summary.weekEnd, summary.complete], ['2026-10-18T23:00:00Z', '2026-10-26T00:00:00Z', '2026-10-26T00:00:00Z', true]);
    assert.deepEqual(summary.workspace, { id: workspace(1), name: 'Acme' });
    assert.deepEqual(summary.totals, { spend: 26, requests: 31, successfulRequests: 29, successRate: 0.9355, inputTokens: 3100000, outputTokens: 620000, tokens: 3720000 });
    assert.deepEqual(summary.previous, {
        from: '2026-10-11T23:00:00Z', to: '2026-10-18T23:00:00Z', spend: 27, requests: 11, successfulRequests: 11, successRate: 1,
        inputTokens: 1100000, outputTokens: 220000, tokens: 1320000,
    });
    assert.deepEqual(summary.change, { spend: -0.037, requests: 1.8182 });
    assert.deepEqual(summary.days.map(day => day.date), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    // Local days: the 02:00 UTC requests count on the day in BST, and Sunday's 19:00 UTC request on Sunday.
    assert.deepEqual(summary.days.map(day => day.requests), [3, 4, 4, 4, 4, 11, 1]);
    assert.equal(summary.days.reduce((sum, day) => sum + day.spend, 0), 26);
    assert.deepEqual(Object.keys(summary.days[0]).sort(), ['date', 'inputTokens', 'outputTokens', 'requests', 'spend', 'tokens']);
    assert.deepEqual(summary.topModels, [
        { modelId: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', spend: 21, requests: 21 },
        { modelId: 'openai/gpt-6-astra', name: 'GPT-6 Astra', spend: 5, requests: 10 },
    ]);
    assert.equal(summary.releases.matching, 'rules');
    assert.deepEqual(summary.releases.items.map(item => item.modelId), ['deepseek/v5', 'openai/gpt-6-mini', 'openai/gpt-6-astra-pro', 'openai/gpt-6-astra'], 'Mistral is muted');
    assert.deepEqual(summary.releases.items[3], {
        modelId: 'openai/gpt-6-astra', name: 'GPT-6 Astra', labId: 'openai', labName: 'OpenAI', kind: 'model_released',
        occurredAt: '2026-10-20T10:00:00Z', href: '/models/openai/gpt-6-astra',
    });
    assert.equal(summary.releases.count, 4);
    // The figures are the requests themselves, summed directly.
    const direct = await one(`select count(*)::int requests, sum(cost_nanos)::numeric / 1e9 spend from public.v2_request_facts
      where workspace_id = $1 and occurred_at >= '2026-10-18 23:00Z' and occurred_at < '2026-10-26 00:00Z'`, [workspace(1)]);
    assert.deepEqual([summary.totals.requests, summary.totals.spend], [direct.requests, Number(direct.spend)]);
    // Midweek in the device's time zone (u1's latest device, London) when none is given, up to now.
    const midweek = await asService(async () => (await one(`select public.get_mobile_week_summary($1, $2, null, null, '2026-10-21 12:00Z') s`, [user(1), workspace(1)])).s);
    assert.deepEqual([midweek.week, midweek.timeZone, midweek.to, midweek.complete, midweek.totals.requests], ['2026-W43', 'Europe/London', '2026-10-21T12:00:00Z', false, 9]);
    assert.equal(midweek.days.length, 7);
    assert.deepEqual(midweek.change, { spend: null, requests: null }, 'no change without usage in both spans');
    assert.equal(await asService(async () => (await one(`select public.get_mobile_week_summary($1, $2, '2025-W53', 'UTC') s`, [user(1), workspace(1)])).s), null);

    // A device that goes back to an app build without the digest channel (scheme 1) while a digest
    // waits for it never gets the digest: the row is closed before claiming.
    await db.exec(`insert into public.mobile_push_digests (user_id, iso_week, time_zone, week_start, week_cutoff, status, workspace_id, title, body, href, created_at)
      values ('${user(3)}', '2026-W45', 'Asia/Tokyo', '2026-11-01 15:00Z', '2026-11-08 09:00Z', 'queued', '${workspace(6)}', 'Your Phaseo week', 'A quiet week', '/account/week', '2026-11-04 08:00Z');
      insert into public.mobile_push_deliveries (digest_id, workspace_id, device_id, user_id, status, not_before, created_at)
      select g.id, g.workspace_id, d.id, d.user_id, 'deferred', now() - interval '1 hour', '2026-11-04 08:00Z'
      from public.mobile_push_digests g join public.mobile_push_devices d on d.user_id = g.user_id where g.user_id = '${user(3)}' and g.iso_week = '2026-W45';`);
    await asService(() => db.query(`select public.register_mobile_push_device($1, 'install-u3', 'ExponentPushToken[u3]', 'android', 'Asia/Tokyo', 'Pixel', '1.9.0', 1)`, [user(3)]));
    const downgraded = await claim('2026-11-04 12:00Z');
    assert.deepEqual([downgraded.closed, downgraded.pushes], [1, []]);
    assert.deepEqual(await rows(`select x.status, x.error_code from public.mobile_push_deliveries x join public.mobile_push_digests g on g.id = x.digest_id
      where g.user_id = $1 and g.iso_week = '2026-W45'`, [user(3)]), [{ status: 'suppressed', error_code: 'channel_scheme_unsupported' }]);

    // A digest backlog bigger than one run sends (the job's 10 calls of 100) never holds catalogue
    // pushes back: the catalogue claim skips digest rows before its limit, even when they are older
    // and would otherwise fill it. The digest job sends the oldest 1,000 and the next run the rest.
    await db.exec(`
      insert into public.mobile_notification_preferences (user_id, enabled) values ('${user(11)}', true);
      insert into public.mobile_push_devices (user_id, installation_id, expo_push_token, platform, time_zone, channel_scheme)
        select '${user(11)}', 'install-bulk-' || n, 'ExponentPushToken[bulk-' || n || ']', 'android', 'UTC', 2 from generate_series(1, 1050) n;
      insert into public.mobile_push_digests (user_id, iso_week, time_zone, week_start, week_cutoff, status, title, body, href, created_at)
        values ('${user(11)}', '2026-W44', 'UTC', '2026-10-26Z', '2026-11-01 18:00Z', 'queued', 'Your Phaseo week', 'A quiet week', '/account/week', '2026-11-04 08:00Z');
      insert into public.mobile_push_deliveries (digest_id, device_id, user_id, status, not_before, created_at)
        select g.id, d.id, d.user_id, 'pending', now() - interval '1 hour', '2026-11-04 08:00Z'
        from public.mobile_push_digests g join public.mobile_push_devices d on d.user_id = g.user_id where g.user_id = '${user(11)}';
      -- u1's price change from the cap check above is now due, on all three devices.
      update public.mobile_push_deliveries set not_before = now() - interval '30 minutes'
        where event_id = (select id from public.catalogue_notification_events where dedupe_key = 'cap');
    `);
    const backlog = `select count(*)::int n from public.mobile_push_deliveries where user_id = '${user(11)}' and status = 'pending'`;
    const catalogue = await asService(() => rows('select * from public.claim_mobile_push_deliveries(100, $1)', [claimToken()]));
    assert.deepEqual(catalogue.map(push => push.expo_push_token).sort(), ['ExponentPushToken[u1-new]', 'ExponentPushToken[u1-phone]', 'ExponentPushToken[u1-tablet]']);
    assert.ok(catalogue.every(push => push.kind === 'price_changed'));
    assert.equal((await one(backlog)).n, 1050, 'the catalogue claim leaves every digest row alone');
    const run = async () => {
        let sent = 0;
        for (let call = 0; call < 10; call += 1) {
            const batch = await claimPushes('2026-11-04 12:00Z', 100);
            sent += batch.pushes.length;
            if (batch.pushes.length > 0) await complete(batch.pushes);
            if (batch.pushes.length < 100) break;
        }
        return sent;
    };
    assert.equal(await run(), 1000, 'one run sends ten full batches');
    assert.equal((await one(backlog)).n, 50);
    assert.deepEqual(await asService(() => rows('select * from public.claim_mobile_push_deliveries(100, $1)', [claimToken()])), [], 'still nothing for the catalogue claim to take');
    assert.equal(await run(), 50, 'the next run sends the rest');
    assert.equal((await one(backlog)).n, 0);

    // Backend only: the service role reads and claims, the browser roles do nothing.
    await asService(async () => {
        await assert.rejects(db.query(`insert into public.mobile_push_digests (user_id, iso_week, time_zone, week_start, week_cutoff, status) values ($1, '2026-W50', 'UTC', now(), now(), 'skipped')`, [user(1)]), /permission denied/);
        assert.ok((await rows('select id from public.mobile_push_digests')).length > 0);
    });
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query('select public.claim_mobile_push_digests(10, $1)', [claimToken()]), /permission denied/);
        await assert.rejects(db.query('select public.get_mobile_week_summary($1, $2)', [user(1), workspace(1)]), /permission denied/);
        await assert.rejects(db.query('select * from public.mobile_push_digests'), /permission denied/);
        await db.exec('reset role');
    }

    if (process.env.MOBILE_PUSH_DIGEST_TIMINGS) {
        // Idle cost, the way #3035 measured it: 20,000 sent delivery rows, nothing due.
        await db.exec(`insert into public.catalogue_notification_events (kind, dedupe_key, title, body, href, occurred_at, fanned_out_at)
          select 'price_changed', 'bulk-' || n, 't', 'b', '/', now(), now() from generate_series(1, 20000) n;
          insert into public.mobile_push_deliveries (event_id, device_id, user_id, status, sent_at)
          select e.id, d.id, d.user_id, 'sent', now() from public.catalogue_notification_events e
          cross join (select id, user_id from public.mobile_push_devices where installation_id = 'install-u5') d where e.dedupe_key like 'bulk-%';
          analyze;`);
        const time = async (label, run) => {
            for (let i = 0; i < 20; i += 1) await run();
            const start = performance.now();
            for (let i = 0; i < 200; i += 1) await run();
            console.log(`${label}: ${((performance.now() - start) / 200).toFixed(2)} ms`);
        };
        console.log('delivery rows:', (await one('select count(*)::int n from public.mobile_push_deliveries')).n);
        await time('idle claim_mobile_push_digests outside the build hours (Wednesday)', () => claim('2026-10-28 12:00Z'));
        await time('idle claim_mobile_push_digests inside the build hours, nobody due (Sunday 08:59 UTC)', () => claim('2026-10-25 08:59Z'));
        await time('idle claim_mobile_push_digests inside the build hours, everyone written (Sunday 18:30 UTC)', () => claim('2026-10-25 18:30Z'));
        await time('idle claim_mobile_push_deliveries, for comparison', () => asService(() => rows('select * from public.claim_mobile_push_deliveries(100, $1)', [claimToken()])));
    }
    console.log('mobile push digest: ok');
} finally {
    await db.close();
}
