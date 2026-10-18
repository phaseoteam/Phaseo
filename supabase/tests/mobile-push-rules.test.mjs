import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const migrationFile = '../migrations/20261018135417_mobile_push_rules.sql';
const schemaFiles = [
    '../schemas/public/tables/mobile_notification_rules.sql',
    '../schemas/public/tables/catalogue_notification_events.sql',
    '../schemas/public/tables/catalogue_notification_cursors.sql',
    '../schemas/public/tables/catalogue_notification_skipped_transactions.sql',
    '../schemas/public/tables/mobile_push_deliveries.sql',
    '../schemas/private/functions/catalogue_notification_usd.sql',
    '../schemas/private/functions/mobile_notification_rule_matches.sql',
    '../schemas/private/functions/record_model_released_notification.sql',
    '../schemas/public/functions/capture_catalogue_notification_events.sql',
    '../schemas/public/functions/enqueue_mobile_push_deliveries.sql',
    '../schemas/public/functions/claim_mobile_push_deliveries.sql',
    '../schemas/public/functions/complete_mobile_push_deliveries.sql',
    '../schemas/public/functions/claim_mobile_push_receipts.sql',
    '../schemas/public/functions/record_mobile_push_receipts.sql',
    '../schemas/public/functions/register_mobile_push_device.sql',
    '../schemas/public/functions/reorder_mobile_notification_rules.sql',
    '../schemas/public/functions/claim_mobile_push_test.sql',
];
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const asService = async fn => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const capture = () => asService(async () => (await one('select public.capture_catalogue_notification_events(2000, 20) r')).r);
const user = n => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const token = name => `ExponentPushToken[${name}]`;

try {
    // The migration carries every schema file it was built from.
    const migration = await read(migrationFile);
    for (const file of schemaFiles) assert.ok(migration.includes((await read(file)).trim()), `${file} is in the migration`);
    const announcements = await read('../schemas/public/tables/model_discovery_public_announcements.sql');
    const trigger = announcements.slice(announcements.indexOf('CREATE TRIGGER record_model_released_notification'), announcements.indexOf('private.record_model_released_notification();') + 46);
    assert.ok(trigger.length > 100 && migration.includes(trigger), 'the announcement trigger is in the migration');
    assert.ok(!(await read('../schemas/public/tables/v2_models.sql')).includes('enqueue_public_model_release_push'), 'the old trigger is gone from v2_models');

    // Pre-existing objects in production shape, trimmed to what the migration uses.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create schema auth; create schema private; create schema catalogue_private;
      grant usage on schema private to service_role;
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
      grant select, insert, update on public.model_discovery_public_announcements to service_role;

      -- The August 2026 tables and trigger, as they exist in production.
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
      create function public.enqueue_public_model_release_push() returns trigger language plpgsql as $$
      begin
        insert into public.model_release_push_events (model_slug, model_name, lab_name) values (new.model_slug, new.name, new.lab_slug)
        on conflict (model_slug) do nothing;
        return new;
      end $$;
      create trigger enqueue_public_model_release_push after insert or update of status, hidden, released_at on public.v2_models
        for each row execute function public.enqueue_public_model_release_push();
    `);
    await db.exec(await read('../schemas/catalogue_private/functions/history_model.sql'));
    await db.exec(await read('../schemas/catalogue_private/functions/record_row_history.sql'));
    for (const table of ['v2_models', 'v2_model_provider_routes', 'v2_pricing_skus', 'v2_pricing_sku_meters']) {
        await db.exec(`create trigger catalogue_row_history after insert or update or delete on public.${table} for each row execute function catalogue_private.record_row_history()`);
    }
    await db.exec(await read('../schemas/public/functions/catalog_model_is_public.sql'));

    // Production state before the migration: an opted-in user and the old trigger's backlog.
    const legacy = user(10);
    await db.exec(`
      insert into auth.users values ('${legacy}');
      insert into public.mobile_notification_preferences (user_id, new_model_releases_enabled) values ('${legacy}', true);
      insert into public.v2_labs values ('openai', 'OpenAI');
      insert into public.v2_models (model_slug, lab_slug, name) values ('openai/gpt-3.5', 'openai', 'GPT-3.5');
    `);
    assert.equal((await one(`select status from public.model_release_push_events`)).status, 'pending');

    await db.exec(migration);

    // The legacy opt-in becomes push on plus one rule; the old queue is closed and stays empty.
    assert.deepEqual(await one(`select enabled, daily_cap, quiet_start from public.mobile_notification_preferences where user_id = $1`, [legacy]),
        { enabled: true, daily_cap: 10, quiet_start: null });
    assert.deepEqual(await rows(`select name, action, event_kinds, lab_mode, include_free_variants from public.mobile_notification_rules where user_id = $1`, [legacy]),
        [{ name: 'New models', action: 'notify', event_kinds: ['model_released'], lab_mode: 'all', include_free_variants: false }]);
    assert.deepEqual(await rows(`select status, last_error from public.model_release_push_events`),
        [{ status: 'failed', last_error: 'expired: superseded by catalogue_notification_events' }]);
    await db.exec(`insert into public.v2_models (model_slug, lab_slug, name) values ('openai/gpt-3.5-turbo', 'openai', 'GPT-3.5 Turbo')`);
    assert.equal((await one(`select count(*)::int n from public.model_release_push_events`)).n, 1, 'the old trigger no longer fires');

    // Catalogue as it stands when the job is first switched on.
    await db.exec(`
      insert into public.v2_labs values ('anthropic', 'Anthropic'), ('deepseek', 'DeepSeek'), ('qwen', 'Qwen'), ('meta', 'Meta'), ('bulk', 'Bulk');
      insert into public.v2_providers values ('openai', 'OpenAI'), ('anthropic', 'Anthropic'), ('amazon-bedrock', 'Amazon Bedrock'),
        ('deepseek', 'DeepSeek'), ('deepinfra', 'DeepInfra');
      insert into public.v2_models (model_slug, lab_slug, name, input_modalities) values
        ('openai/gpt-6', 'openai', 'GPT-6', '{text,image}'), ('openai/gpt-6-mini', 'openai', 'GPT-6 mini', '{text}'),
        ('openai/gpt-4.1', 'openai', 'GPT-4.1', '{text}'), ('openai/gpt-oss-120b:free', 'openai', 'gpt-oss-120b (free)', '{text}'),
        ('openai/secret', 'openai', 'Secret', '{text}'), ('anthropic/claude-haiku-5.5', 'anthropic', 'Claude Haiku 5.5', '{text}'),
        ('deepseek/deepseek-v4', 'deepseek', 'DeepSeek V4', '{text}'), ('qwen/qwen3-max', 'qwen', 'Qwen3 Max', '{text}'),
        ('meta/llama-5', 'meta', 'Llama 5', '{text}');
      update public.v2_models set replacement_model_slug = 'openai/gpt-6' where model_slug = 'openai/gpt-4.1';
      insert into public.v2_model_provider_routes (provider_model_id, model_slug, provider_slug, routing_enabled, is_stealth) values
        ('openai:gpt-6', 'openai/gpt-6', 'openai', false, false), ('openai:gpt-6-mini', 'openai/gpt-6-mini', 'openai', false, false),
        ('openai:gpt-4.1', 'openai/gpt-4.1', 'openai', true, false), ('deepinfra:gpt-oss', 'openai/gpt-oss-120b:free', 'deepinfra', false, false),
        ('stealth:secret', 'openai/secret', 'openai', false, true), ('anthropic:haiku', 'anthropic/claude-haiku-5.5', 'anthropic', true, false),
        ('bedrock:haiku', 'anthropic/claude-haiku-5.5', 'amazon-bedrock', false, false), ('deepseek:v4', 'deepseek/deepseek-v4', 'deepseek', true, false),
        ('deepinfra:qwen3-max', 'qwen/qwen3-max', 'deepinfra', false, false), ('deepinfra:llama-5', 'meta/llama-5', 'deepinfra', false, false);
      insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code, version) values
        ('10000000-0000-4000-8000-000000000001', 'deepseek:v4', 'standard', 1);
      insert into public.v2_pricing_sku_meters (sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit, meter_order) values
        ('10000000-0000-4000-8000-000000000001', 'input_tokens', 'text', 'input', 'token', 1000000, 280000000, 'Input tokens', '1M tokens', 100),
        ('10000000-0000-4000-8000-000000000001', 'output_tokens', 'text', 'output', 'token', 1000000, 420000000, 'Output tokens', '1M tokens', 110),
        ('10000000-0000-4000-8000-000000000001', 'cached_input_tokens', 'text', 'input', 'token', 1000000, 28000000, 'Cached input', '1M tokens', 120);
    `);
    assert.equal((await capture()).initialized, true, 'the first capture starts from now');

    // Catalogue changes, one transaction each.
    await db.exec(`update public.v2_model_provider_routes set routing_enabled = true where provider_model_id = 'openai:gpt-6'`);
    await db.exec(`update public.v2_pricing_sku_meters set price_nanos = 140000000 where meter_key in ('input_tokens', 'cached_input_tokens')`);
    await db.exec(`update public.v2_model_provider_routes set routing_enabled = true where provider_model_id = 'bedrock:haiku'`);
    await db.exec(`update public.v2_models set deprecated_at = now(), retired_at = '2099-11-12T12:00:00Z' where model_slug = 'openai/gpt-4.1'`);
    await db.exec(`
      update public.v2_pricing_skus set status = 'deprecated', effective_to = now() where sku_id = '10000000-0000-4000-8000-000000000001';
      insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code, version) values ('10000000-0000-4000-8000-000000000002', 'deepseek:v4', 'standard', 2);
      insert into public.v2_pricing_sku_meters (sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit, meter_order) values
        ('10000000-0000-4000-8000-000000000002', 'input_tokens', 'text', 'input', 'token', 1000000, 140000000, 'Input tokens', '1M tokens', 100),
        ('10000000-0000-4000-8000-000000000002', 'output_tokens', 'text', 'output', 'token', 1000000, 560000000, 'Output tokens', '1M tokens', 110);
    `);
    await db.exec(`update public.v2_model_provider_routes set routing_enabled = true where provider_model_id in ('deepinfra:gpt-oss', 'deepinfra:qwen3-max')`);
    await db.exec(`update public.v2_model_provider_routes set routing_enabled = true where provider_model_id = 'stealth:secret'`);
    // A bulk sync: 25 new models and, in the same transaction, a route that would otherwise be news.
    await db.exec(`
      insert into public.v2_models (model_slug, lab_slug, name) select 'bulk/m' || n, 'bulk', 'Bulk ' || n from generate_series(1, 25) n;
      update public.v2_model_provider_routes set routing_enabled = true where provider_model_id = 'openai:gpt-6-mini';
    `);

    // Rows are read up to the previous call's checkpoint, so new changes need a second call.
    assert.equal((await capture()).emitted, 0);
    const captured = await capture();
    assert.equal(captured.emitted, 7);
    assert.equal(captured.skippedTransactions, 1);
    assert.equal((await capture()).emitted, 0, 'nothing is captured twice');
    assert.deepEqual(await rows(`select model_count, row_count from public.catalogue_notification_skipped_transactions`), [{ model_count: 26, row_count: 26 }]);

    const events = await rows(`select kind, dedupe_key, lab_slug, provider_slug, title, body, href, payload from public.catalogue_notification_events order by title collate "C"`);
    assert.deepEqual(events.map(e => [e.kind, e.title, e.body]), [
        ['provider_added', 'Claude Haiku 5.5 is now available from Amazon Bedrock', 'Amazon Bedrock is now a provider for Claude Haiku 5.5 on Phaseo.'],
        ['price_changed', 'DeepSeek V4 input price fell from $0.28 to $0.14 per 1M tokens', 'From DeepSeek.'],
        ['price_changed', 'DeepSeek V4 output price rose from $0.42 to $0.56 per 1M tokens', 'From DeepSeek.'],
        ['deprecation_announced', 'GPT-4.1 will be retired on 12 Nov 2099', 'OpenAI has deprecated GPT-4.1. Suggested replacement: GPT-6.'],
        ['gateway_available', 'GPT-6 is now on Phaseo', 'You can now use it through Phaseo, served by OpenAI.'],
        ['gateway_available', 'Qwen3 Max is now on Phaseo', 'You can now use it through Phaseo, served by DeepInfra.'],
        ['gateway_available', 'gpt-oss-120b (free) is now on Phaseo', 'You can now use it through Phaseo, served by DeepInfra.'],
    ]);
    const fell = events.find(e => e.title.includes('fell'));
    assert.equal(fell.href, '/models/deepseek/deepseek-v4');
    assert.deepEqual(fell.payload.changes, [{ meter: 'input_tokens', label: 'input', unit: '1M tokens', old: 0.28, new: 0.14, direction: 'down' }],
        'cached prices are not news');
    assert.equal(events.find(e => e.kind === 'deprecation_announced').provider_slug, null);

    // The announcer's pending -> announced transition is the release; re-announcing adds nothing.
    await asService(() => db.exec(`
      insert into public.model_discovery_public_announcements (model_slug) values ('openai/gpt-6'), ('openai/secret');
      update public.model_discovery_public_announcements set status = 'announced', announced_at = now();
      update public.model_discovery_public_announcements set status = 'pending';
      update public.model_discovery_public_announcements set status = 'announced';
    `));
    assert.deepEqual(await rows(`select title, body, lab_slug from public.catalogue_notification_events where kind = 'model_released'`),
        [{ title: 'OpenAI released GPT-6', body: 'You can use it on Phaseo now.', lab_slug: 'openai' }]);

    // Users, devices and rules.
    await db.exec(`insert into auth.users select ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 8) n`);
    await asService(async () => {
        const register = (n, name, timeZone = 'UTC') => db.query(
            `select public.register_mobile_push_device($1, $2, $3, 'android', $4, 'Pixel', '1.0.0') id`, [user(n), `install-${name}`, token(name), timeZone]);
        for (const [n, name, tz] of [[1, 'd1'], [2, 'd2'], [3, 'd3'], [4, 'd4', 'Asia/Tokyo'], [5, 'd5'], [6, 'd6'], [7, 'd7'], [7, 'd7b'], [8, 'd8'], [10, 'dl']]) {
            await register(n, name, tz);
        }
        await db.exec(`update public.mobile_push_devices set status = 'disabled' where installation_id = 'install-d7b'`);
        await db.exec(`
          insert into public.mobile_notification_preferences (user_id, enabled, daily_cap)
            select ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, n <> 6, case when n = 5 then 1 else 10 end
            from generate_series(1, 8) n;
          update public.mobile_notification_preferences
            set quiet_start = ((now() at time zone 'Asia/Tokyo') - interval '1 hour')::time,
                quiet_end = ((now() at time zone 'Asia/Tokyo') + interval '1 hour')::time
            where user_id = '${user(4)}';
          insert into public.mobile_notification_rules (user_id, action, event_kinds, lab_mode, lab_slugs, provider_mode, provider_slugs, model_slugs, output_modalities, include_free_variants, only_on_phaseo) values
            ('${user(1)}', 'notify', '{model_released,gateway_available,price_changed,deprecation_announced,provider_added}', 'except', '{qwen,meta}', 'all', '{}', '{}', '{}', false, false),
            ('${user(2)}', 'notify', '{model_released,gateway_available}', 'only', '{openai}', 'all', '{}', '{}', '{}', false, false),
            ('${user(2)}', 'mute', '{model_released,gateway_available}', 'all', '{}', 'all', '{}', '{openai/gpt-6}', '{}', false, false),
            ('${user(3)}', 'notify', '{model_released,gateway_available,price_changed,deprecation_announced,provider_added}', 'all', '{}', 'all', '{}', '{}', '{text}', true, false),
            ('${user(4)}', 'notify', '{model_released,gateway_available,price_changed,deprecation_announced,provider_added}', 'all', '{}', 'all', '{}', '{}', '{}', false, false),
            ('${user(5)}', 'notify', '{model_released,gateway_available,price_changed,deprecation_announced,provider_added}', 'all', '{}', 'all', '{}', '{}', '{}', false, false),
            ('${user(6)}', 'notify', '{model_released,gateway_available,price_changed,deprecation_announced,provider_added}', 'all', '{}', 'all', '{}', '{}', '{}', false, false),
            ('${user(7)}', 'notify', '{price_changed}', 'all', '{}', 'only', '{deepseek}', '{}', '{}', false, true),
            ('${user(8)}', 'notify', '{gateway_available}', 'all', '{}', 'except', '{openai}', '{}', '{}', false, false),
            ('${user(8)}', 'notify', '{deprecation_announced}', 'all', '{}', 'only', '{openai}', '{}', '{}', false, false);
        `);
    });

    // Fan out in a fixed order.
    const order = ['gateway_available:openai/gpt-6', 'price_changed:fell', 'provider_added:anthropic/claude-haiku-5.5:amazon-bedrock',
        'deprecation_announced:openai/gpt-4.1', 'price_changed:rose', 'gateway_available:openai/gpt-oss-120b:free', 'gateway_available:qwen/qwen3-max',
        'model_released:openai/gpt-6'];
    const eventIds = {};
    for (const event of await rows(`select id, kind, dedupe_key, title from public.catalogue_notification_events`)) {
        const key = event.kind === 'price_changed' ? (event.title.includes('fell') ? 'price_changed:fell' : 'price_changed:rose') : event.dedupe_key;
        eventIds[key] = event.id;
    }
    const totals = { queued: 0, deferred: 0, suppressed: 0 };
    await asService(async () => {
        for (const key of order) {
            const result = (await one('select public.enqueue_mobile_push_deliveries($1) r', [eventIds[key]])).r;
            for (const name of Object.keys(totals)) totals[name] += result[name];
        }
        assert.deepEqual((await one('select public.enqueue_mobile_push_deliveries($1) r', [eventIds[order[0]]])).r, { queued: 0, deferred: 0, suppressed: 0 },
            'an event fans out once');
    });
    assert.deepEqual(totals, { queued: 17, deferred: 6, suppressed: 5 });
    const names = Object.fromEntries(Object.entries(eventIds).map(([key, id]) => [id, key]));
    const deliveries = await rows(`
      select x.event_id, d.installation_id, x.status, x.error_code, x.not_before > now() + interval '59 minutes' and x.not_before < now() + interval '61 minutes' as after_quiet_hours
      from public.mobile_push_deliveries x join public.mobile_push_devices d on d.id = x.device_id`);
    const byEvent = key => deliveries.filter(x => names[x.event_id] === key).map(x => `${x.installation_id.slice(8)}:${x.status}`).sort();
    // d1 excludes Qwen and Meta and free variants; d2 is only OpenAI but mutes GPT-6; d3 wants free variants;
    // d4 is in quiet hours; d5 is capped at one a day; d6 has push off; d7 only DeepSeek prices on Phaseo
    // (d7b is signed out); d8 wants Phaseo availability except via OpenAI, and its provider-only
    // deprecation rule never matches an event without a provider; dl is the converted legacy user.
    assert.deepEqual(byEvent('gateway_available:openai/gpt-6'), ['d1:pending', 'd3:pending', 'd4:deferred', 'd5:pending']);
    assert.deepEqual(byEvent('price_changed:fell'), ['d1:pending', 'd3:pending', 'd4:deferred', 'd5:suppressed', 'd7:pending']);
    assert.deepEqual(byEvent('provider_added:anthropic/claude-haiku-5.5:amazon-bedrock'), ['d1:pending', 'd3:pending', 'd4:deferred', 'd5:suppressed']);
    assert.deepEqual(byEvent('deprecation_announced:openai/gpt-4.1'), ['d1:pending', 'd3:pending', 'd4:deferred', 'd5:suppressed']);
    assert.deepEqual(byEvent('price_changed:rose'), ['d1:pending', 'd3:pending', 'd4:deferred', 'd5:suppressed', 'd7:pending']);
    assert.deepEqual(byEvent('gateway_available:openai/gpt-oss-120b:free'), ['d3:pending']);
    assert.deepEqual(byEvent('gateway_available:qwen/qwen3-max'), ['d3:pending', 'd4:deferred', 'd5:suppressed', 'd8:pending']);
    // Devices already told GPT-6 reached Phaseo are not told again that it was released.
    assert.deepEqual(byEvent('model_released:openai/gpt-6'), ['dl:pending']);
    assert.ok(deliveries.filter(x => x.status === 'deferred').every(x => x.after_quiet_hours), 'deferred until quiet hours end in Tokyo');
    assert.ok(deliveries.filter(x => x.status === 'suppressed').every(x => x.error_code === 'daily_cap'));

    // Claims are exclusive; completions only apply under the claim's token.
    const claimA = '20000000-0000-4000-8000-00000000000a';
    const claimB = '20000000-0000-4000-8000-00000000000b';
    const claimed = await asService(() => rows('select * from public.claim_mobile_push_deliveries(500, $1)', [claimA]));
    assert.equal(claimed.length, 17);
    assert.ok(claimed.every(x => x.attempts === 1 && x.expo_push_token.startsWith('ExponentPushToken[') && x.href.startsWith('/models/')));
    assert.equal((await asService(() => rows('select * from public.claim_mobile_push_deliveries(500, $1)', [claimB]))).length, 0);
    const d7 = claimed.find(x => x.expo_push_token === token('d7'));
    const sent = claimed.find(x => x.expo_push_token === token('d1'));
    const retry = claimed.find(x => x.expo_push_token === token('d5'));
    const results = JSON.stringify([
        { id: sent.id, status: 'sent', ticketId: 'ticket-1' },
        { id: d7.id, status: 'failed', errorCode: 'DeviceNotRegistered', errorMessage: 'not registered' },
        { id: retry.id, status: 'retry', errorCode: 'MessageRateExceeded' },
    ]);
    assert.deepEqual((await asService(() => one('select public.complete_mobile_push_deliveries($1, $2) r', [claimB, results]))).r,
        { sent: 0, retrying: 0, failed: 0, invalidated: 0 }, 'another claim cannot complete these rows');
    assert.deepEqual((await asService(() => one('select public.complete_mobile_push_deliveries($1, $2) r', [claimA, results]))).r,
        { sent: 1, retrying: 1, failed: 1, invalidated: 1 });
    assert.equal((await one(`select status from public.mobile_push_devices where installation_id = 'install-d7'`)).status, 'invalid');
    assert.deepEqual(await one(`select status, claim_token, not_before > now() + interval '50 seconds' backed_off from public.mobile_push_deliveries where id = $1`, [retry.id]),
        { status: 'pending', claim_token: null, backed_off: true });
    // d7's other push is closed rather than sent once the device is gone.
    await db.exec(`update public.mobile_push_deliveries set status = 'pending', claim_token = null where status = 'processing' and device_id = (select id from public.mobile_push_devices where installation_id = 'install-d7')`);
    await asService(() => rows('select * from public.claim_mobile_push_deliveries(500, $1)', [claimB]));
    assert.deepEqual(await rows(`select x.status, x.error_code from public.mobile_push_deliveries x join public.mobile_push_devices d on d.id = x.device_id where d.installation_id = 'install-d7' and x.id <> $1`, [d7.id]),
        [{ status: 'suppressed', error_code: 'device_inactive' }]);

    // Receipts are fetched once, after 15 minutes; an error receipt retires the device.
    assert.equal((await asService(() => rows('select * from public.claim_mobile_push_receipts(100)'))).length, 0);
    await db.exec(`update public.mobile_push_deliveries set sent_at = now() - interval '20 minutes' where id = '${sent.id}'`);
    assert.deepEqual(await asService(() => rows('select * from public.claim_mobile_push_receipts(100)')), [{ id: sent.id, expo_ticket_id: 'ticket-1' }]);
    assert.equal((await asService(() => rows('select * from public.claim_mobile_push_receipts(100)'))).length, 0);
    assert.deepEqual((await asService(() => one('select public.record_mobile_push_receipts($1) r', [JSON.stringify([{ id: sent.id, errorCode: 'DeviceNotRegistered' }])]))).r,
        { failed: 1, invalidated: 1 });

    // Stale events and events about models that went private close without sending.
    await db.exec(`insert into public.catalogue_notification_events (kind, dedupe_key, model_slug, lab_slug, title, body, href, occurred_at) values
      ('model_released', 'stale', 'openai/gpt-6-mini', 'openai', 'Old', 'Old', '/models/openai/gpt-6-mini', now() - interval '3 days'),
      ('model_released', 'private', 'openai/secret', 'openai', 'Secret', 'Secret', '/models/openai/secret', now())`);
    for (const key of ['stale', 'private']) {
        const id = (await one(`select id from public.catalogue_notification_events where dedupe_key = $1`, [key])).id;
        assert.deepEqual((await asService(() => one('select public.enqueue_mobile_push_deliveries($1) r', [id]))).r, { queued: 0, deferred: 0, suppressed: 0 });
        assert.ok((await one(`select fanned_out_at from public.catalogue_notification_events where id = $1`, [id])).fanned_out_at);
    }

    // A later change is picked up on the following runs; Meta is excluded by d1's rule.
    await db.exec(`update public.v2_model_provider_routes set routing_enabled = true where provider_model_id = 'deepinfra:llama-5'`);
    assert.equal((await capture()).emitted, 0);
    assert.equal((await capture()).emitted, 1);
    const llama = (await one(`select id from public.catalogue_notification_events where dedupe_key = 'gateway_available:meta/llama-5'`)).id;
    await asService(() => one('select public.enqueue_mobile_push_deliveries($1) r', [llama]));
    assert.deepEqual((await rows(`select d.installation_id from public.mobile_push_deliveries x join public.mobile_push_devices d on d.id = x.device_id where x.event_id = $1 order by 1`, [llama])).map(x => x.installation_id),
        ['install-d3', 'install-d4', 'install-d5', 'install-d8']);

    // Device registration: one row per token and installation, across accounts.
    await asService(async () => {
        const register = (n, installation, name, timeZone = 'Europe/London') => one(
            `select public.register_mobile_push_device($1, $2, $3, 'android', $4, null, null) id`, [user(n), installation, token(name), timeZone]);
        const first = (await register(1, 'install-shared', 'shared')).id;
        assert.equal((await register(1, 'install-shared', 'shared-rotated')).id, first, 'a new token for the same installation updates it');
        await register(2, 'install-other', 'shared-rotated');
        assert.deepEqual(await rows(`select user_id, installation_id from public.mobile_push_devices where expo_push_token = $1`, [token('shared-rotated')]),
            [{ user_id: user(2), installation_id: 'install-other' }], 'a token that moves account moves, not duplicates');
        await register(3, 'install-other', 'third');
        assert.deepEqual(await rows(`select user_id from public.mobile_push_devices where installation_id = 'install-other'`), [{ user_id: user(3) }]);
        await register(4, 'install-zone', 'zone', 'Not/AZone');
        assert.equal((await one(`select time_zone from public.mobile_push_devices where installation_id = 'install-zone'`)).time_zone, null);
    });

    // Rule order must name every rule exactly once.
    await asService(async () => {
        await db.exec(`insert into public.mobile_notification_rules (user_id, event_kinds, "position") values ('${user(1)}', '{price_changed}', 1), ('${user(1)}', '{model_released}', 2)`);
        const ids = (await rows(`select id from public.mobile_notification_rules where user_id = $1 order by "position", created_at`, [user(1)])).map(x => x.id);
        assert.equal(ids.length, 3);
        assert.equal((await one('select public.reorder_mobile_notification_rules($1, $2) ok', [user(1), [ids[2], ids[0]]])).ok, false);
        assert.equal((await one('select public.reorder_mobile_notification_rules($1, $2) ok', [user(1), [ids[2], ids[0], ids[0]]])).ok, false);
        assert.equal((await one('select public.reorder_mobile_notification_rules($1, $2) ok', [user(2), [ids[2], ids[1], ids[0]]])).ok, false);
        assert.equal((await one('select public.reorder_mobile_notification_rules($1, $2) ok', [user(1), [ids[2], ids[1], ids[0]]])).ok, true);
        assert.deepEqual((await rows(`select id from public.mobile_notification_rules where user_id = $1 order by "position"`, [user(1)])).map(x => x.id), [ids[2], ids[1], ids[0]]);
    });

    // Test pushes: three per ten minutes, only to the caller's registered installation.
    await asService(async () => {
        const test = installation => one('select public.claim_mobile_push_test($1, $2) r', [user(3), installation]);
        for (let attempt = 0; attempt < 3; attempt += 1) assert.equal((await test('install-d3')).r.expoPushToken, token('d3'));
        const limited = (await test('install-d3')).r;
        assert.equal(limited.error, 'rate_limited');
        assert.ok(limited.retryAfterSeconds > 0 && limited.retryAfterSeconds <= 600);
        assert.deepEqual((await test('install-d1')).r, { error: 'device_not_registered' });
    });

    // Backend only: browsers can neither read these tables nor call the functions.
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        for (const table of ['mobile_notification_rules', 'mobile_push_deliveries', 'catalogue_notification_events', 'catalogue_notification_cursors', 'mobile_push_devices']) {
            await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
        }
        await assert.rejects(db.query('select public.capture_catalogue_notification_events(10, 20)'), /permission denied/);
        await assert.rejects(db.query('select public.enqueue_mobile_push_deliveries($1)', [llama]), /permission denied/);
        await assert.rejects(db.query('select * from public.claim_mobile_push_deliveries(10, $1)', [claimA]), /permission denied/);
        await assert.rejects(db.query(`select public.register_mobile_push_device($1, 'install-x', $2, 'android', null, null, null)`, [user(1), token('x')]), /permission denied/);
        await assert.rejects(db.query(`select public.claim_mobile_push_test($1, 'install-d3')`, [user(3)]), /permission denied/);
        await db.exec('reset role');
    }
    console.log('mobile push rules: ok');
} finally {
    await db.close();
}
