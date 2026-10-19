import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const v1File = '../migrations/20261018135417_mobile_push_rules.sql';
const v2File = '../migrations/20261019170840_mobile_push_categories_and_grouping.sql';
const functionFiles = [
    '../schemas/private/functions/mobile_push_category.sql',
    '../schemas/private/functions/mobile_push_group_key.sql',
    '../schemas/private/functions/mobile_push_group_message.sql',
    '../schemas/private/functions/mobile_notification_rule_matches.sql',
    '../schemas/public/functions/capture_catalogue_notification_events.sql',
    '../schemas/public/functions/enqueue_mobile_push_deliveries.sql',
    '../schemas/public/functions/claim_mobile_push_deliveries.sql',
    '../schemas/public/functions/complete_mobile_push_deliveries.sql',
    '../schemas/public/functions/record_mobile_push_receipts.sql',
    '../schemas/public/functions/register_mobile_push_device.sql',
    '../schemas/public/functions/claim_mobile_push_test.sql',
    '../schemas/public/functions/update_mobile_notification_categories.sql',
];
const newFiles = [functionFiles[0], functionFiles[1], functionFiles[2], functionFiles[11]];
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const asService = async fn => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const capture = () => asService(async () => (await one('select public.capture_catalogue_notification_events(2000, 20) r')).r);
const claim = token => asService(() => rows('select * from public.claim_mobile_push_deliveries(500, $1)', [token]));
const complete = (token, results) => asService(async () => (await one('select public.complete_mobile_push_deliveries($1, $2) r', [token, JSON.stringify(results)])).r);
const sendAll = (token, pushes) => complete(token, Object.values(pushes).map(push => ({ id: push.id, status: 'sent', ticketId: `ticket-${push.id}` })));
const user = n => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const pushToken = name => `ExponentPushToken[${name}]`;
let claims = 0;
const claimToken = () => `30000000-0000-4000-8000-${String(++claims).padStart(12, '0')}`;
// Time passes for every waiting delivery that matches: five minutes is the settle window.
const settle = (where = 'true', minutes = 5) => db.exec(`update public.mobile_push_deliveries set not_before = not_before - interval '${minutes} minutes' where status in ('pending', 'deferred') and ${where}`);
const device = name => `(select id from public.mobile_push_devices where installation_id = 'install-${name}')`;
const byDevice = pushes => Object.fromEntries(pushes.map(push => [push.expo_push_token.slice(18, -1), push]));
const fanOut = async () => {
    const totals = { queued: 0, deferred: 0, suppressed: 0 };
    await asService(async () => {
        for (const { id } of await rows(`select id from public.catalogue_notification_events where fanned_out_at is null order by occurred_at, created_at, id`)) {
            const result = (await one('select public.enqueue_mobile_push_deliveries($1) r', [id])).r;
            for (const name of Object.keys(totals)) totals[name] += result[name];
        }
    });
    return totals;
};

try {
    // The migration carries every schema file it changed, and the manifest lists the new ones.
    const v1 = await read(v1File);
    const v2 = await read(v2File);
    for (const file of functionFiles) assert.ok(v2.includes((await read(file)).trim()), `${file} is in the migration`);
    const tables = {};
    for (const name of ['mobile_push_devices', 'mobile_notification_preferences', 'mobile_push_deliveries', 'catalogue_notification_events', 'mobile_notification_rules']) {
        tables[name] = await read(`../schemas/public/tables/${name}.sql`);
    }
    const carried = (name, text) => {
        assert.ok(tables[name].includes(text), `${name}.sql declares ${text.slice(0, 70)}`);
        assert.ok(v2.includes(text), `the migration carries ${text.slice(0, 70)}`);
    };
    carried('mobile_push_devices', 'CHECK (((channel_scheme >= 1) AND (channel_scheme <= 100)))');
    carried('mobile_notification_preferences', "CHECK ((jsonb_typeof(categories) = 'object'::text))");
    carried('mobile_push_deliveries', 'FOREIGN KEY (merged_into) REFERENCES public.mobile_push_deliveries(id) ON DELETE SET NULL');
    carried('mobile_push_deliveries', 'CREATE INDEX mobile_push_deliveries_merged_into_idx ON public.mobile_push_deliveries USING btree (merged_into)\n  WHERE (merged_into IS NOT NULL);');
    for (const [name, constraint] of [['catalogue_notification_events', 'kind_check'], ['mobile_notification_rules', 'event_kinds_check']]) {
        const check = tables[name].match(new RegExp(`CONSTRAINT "${name}_${constraint}"\\n(    CHECK[\\s\\S]*?'provider_launched'::text\\]\\)+)`))?.[1];
        assert.ok(check, `${name} allows provider_launched`);
        carried(name, check);
    }
    // Every comment on these tables is in one of the two migrations, bar the one that predates them.
    for (const [name, table] of Object.entries(tables)) {
        for (const statement of table.match(/^COMMENT ON [^\n]*;$/gm)) {
            if (statement.startsWith('COMMENT ON TABLE "public"."mobile_push_devices"')) continue;
            assert.ok(v1.includes(statement) || v2.includes(statement), `${name}: ${statement.slice(0, 90)} is in a migration`);
        }
        for (const column of ['channel_scheme', 'categories', 'group_key', 'merged_into']) {
            if (table.includes(`"${column}"`)) assert.match(v2, new RegExp(`ADD COLUMN "${column}" `), `${column} is added`);
        }
    }
    const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
    for (const file of newFiles) {
        const path = file.replace('../schemas/', '');
        for (const list of ['loadOrder', 'files']) assert.ok(JSON.stringify(manifest[list]).includes(`"${path}"`), `${path} is in the manifest's ${list}`);
    }

    // Pre-existing objects in production shape, trimmed to what the migrations use.
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
    `);
    await db.exec(await read('../schemas/catalogue_private/functions/history_model.sql'));
    await db.exec(await read('../schemas/catalogue_private/functions/record_row_history.sql'));
    for (const table of ['v2_models', 'v2_model_provider_routes', 'v2_pricing_skus', 'v2_pricing_sku_meters']) {
        await db.exec(`create trigger catalogue_row_history after insert or update or delete on public.${table} for each row execute function catalogue_private.record_row_history()`);
    }
    await db.exec(await read('../schemas/public/functions/catalog_model_is_public.sql'));
    await db.exec(v1);

    // Production as the first migration left it: users, devices registered by today's app (no
    // channel scheme), rules, and a release push still queued.
    await db.exec(`
      insert into auth.users select ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 7) n;
      insert into public.v2_labs values ('mistral', 'Mistral'), ('deepseek', 'DeepSeek'), ('openai', 'OpenAI'), ('open', 'Open Models'), ('qwen', 'Qwen');
      insert into public.v2_providers values ('deepseek', 'DeepSeek'), ('deepinfra', 'DeepInfra'), ('groq', 'Groq'), ('openai', 'OpenAI');
      insert into public.v2_models (model_slug, lab_slug, name) values
        ('mistral/large-3', 'mistral', 'Mistral Large 3'), ('deepseek/deepseek-v4', 'deepseek', 'DeepSeek V4'), ('qwen/qwen3-max', 'qwen', 'Qwen3 Max');
      insert into public.v2_model_provider_routes (provider_model_id, model_slug, provider_slug, routing_enabled) values
        ('deepseek:v4', 'deepseek/deepseek-v4', 'deepseek', true), ('deepinfra:qwen3-max', 'qwen/qwen3-max', 'deepinfra', true);
      insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code) values ('10000000-0000-4000-8000-000000000001', 'deepseek:v4', 'standard');
      insert into public.v2_pricing_sku_meters (sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit, meter_order) values
        ('10000000-0000-4000-8000-000000000001', 'input_tokens', 'text', 'input', 'token', 1000000, 280000000, 'Input tokens', '1M tokens', 100),
        ('10000000-0000-4000-8000-000000000001', 'output_tokens', 'text', 'output', 'token', 1000000, 420000000, 'Output tokens', '1M tokens', 110);
    `);
    assert.equal((await capture()).initialized, true);
    await asService(async () => {
        for (const [n, name] of [[1, 'a1'], [1, 'a2'], [2, 'b1'], [3, 'c1'], [4, 'd1'], [5, 'e1'], [6, 'f1']]) {
            await db.query(`select public.register_mobile_push_device($1, $2, $3, 'android', 'UTC', 'Pixel', '1.0.0')`, [user(n), `install-${name}`, pushToken(name)]);
        }
    });
    const all = '{model_released,gateway_available,price_changed,deprecation_announced,provider_added}';
    // u3 is capped at two a day and only follows DeepSeek; u4 only Phaseo availability; u5 only
    // Groq as a new provider; u6 only releases.
    await db.exec(`
      insert into public.mobile_notification_preferences (user_id, enabled, daily_cap)
        select ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, true, case when n = 3 then 2 else 10 end from generate_series(1, 6) n;
      insert into public.mobile_notification_rules (user_id, event_kinds, lab_mode, lab_slugs, provider_mode, provider_slugs) values
        ('${user(1)}', '${all}', 'all', '{}', 'all', '{}'),
        ('${user(2)}', '${all}', 'all', '{}', 'all', '{}'),
        ('${user(3)}', '${all}', 'only', '{deepseek}', 'all', '{}'),
        ('${user(4)}', '{gateway_available}', 'all', '{}', 'all', '{}'),
        ('${user(5)}', '{provider_added}', 'all', '{}', 'only', '{groq}'),
        ('${user(6)}', '{model_released}', 'all', '{}', 'all', '{}');
    `);
    await asService(() => db.exec(`
      insert into public.model_discovery_public_announcements (model_slug) values ('mistral/large-3');
      update public.model_discovery_public_announcements set status = 'announced', announced_at = now();
    `));
    assert.deepEqual(await fanOut(), { queued: 4, deferred: 0, suppressed: 0 }, 'a1, a2, b1 and f1 hear about Mistral Large 3');

    await db.exec(v2);

    // Queued rows take their group key; devices start on channel scheme 1 and every category is on.
    assert.deepEqual(await rows(`select distinct group_key, status from public.mobile_push_deliveries`), [{ group_key: 'release:mistral', status: 'pending' }]);
    assert.deepEqual(await rows(`select distinct channel_scheme from public.mobile_push_devices`), [{ channel_scheme: 1 }]);
    assert.deepEqual(await rows(`select distinct categories from public.mobile_notification_preferences`), [{ categories: {} }]);

    // The new app registers with channel scheme 2; an old build re-registering falls back to 1.
    await asService(async () => {
        for (const [n, name] of [[1, 'a1'], [2, 'b1'], [3, 'c1'], [4, 'd1'], [5, 'e1'], [6, 'f1']]) {
            await db.query(`select public.register_mobile_push_device($1, $2, $3, 'android', 'UTC', 'Pixel', '2.0.0', 2)`, [user(n), `install-${name}`, pushToken(name)]);
        }
        await db.query(`select public.register_mobile_push_device($1, 'install-a2', $2, 'android', 'UTC', 'Old phone', '1.0.0')`, [user(1), pushToken('a2')]);
        await db.query(`select public.register_mobile_push_device($1, 'install-x9', $2, 'ios', 'UTC', null, null, 0)`, [user(7), pushToken('x9')]);
    });
    assert.deepEqual(await rows(`select installation_id, channel_scheme from public.mobile_push_devices where installation_id in ('install-a1', 'install-a2', 'install-x9') order by 1`),
        [{ installation_id: 'install-a1', channel_scheme: 2 }, { installation_id: 'install-a2', channel_scheme: 1 }, { installation_id: 'install-x9', channel_scheme: 1 }]);

    // Categories merge: unknown keys and values that are not true or false are dropped.
    const setCategories = (n, categories) => asService(async () => (await one('select public.update_mobile_notification_categories($1, $2) r', [user(n), JSON.stringify(categories)])).r);
    assert.deepEqual(await setCategories(2, { 'new-models': false, bogus: true, digest: 'no' }), { 'new-models': false });
    assert.deepEqual(await setCategories(2, { digest: false }), { 'new-models': false, digest: false });
    assert.deepEqual(await setCategories(7, { money: false }), { money: false }, 'a user with no settings yet gets a row');
    await assert.rejects(asService(() => db.query(`select public.update_mobile_notification_categories($1, '[]')`, [user(2)])), /invalid_mobile_notification_categories/);

    // The queued Mistral push: one model, sent as written, with its group's tag. b1 switched new
    // models off after it was queued, so its row is closed instead.
    const today = (await one(`select to_char(now() at time zone 'UTC', 'YYYY-MM-DD') d`)).d;
    let token = claimToken();
    let pushes = byDevice(await claim(token));
    assert.deepEqual(Object.keys(pushes).sort(), ['a1', 'a2', 'f1']);
    assert.deepEqual({ ...pushes.a1, id: null, expo_push_token: null }, {
        id: null, attempts: 1, expo_push_token: null, channel_scheme: 2, kind: 'model_released', category: 'new-models', model_slug: 'mistral/large-3',
        title: 'Mistral released Mistral Large 3', body: 'See the details on Phaseo.', href: '/models/mistral/large-3',
        group_key: 'release:mistral', group_count: 1, tag: `release:mistral:${today}`, deliveries: 1,
    });
    assert.equal(pushes.a2.channel_scheme, 1);
    assert.deepEqual(await one(`select status, error_code from public.mobile_push_deliveries where device_id = ${device('b1')}`), { status: 'suppressed', error_code: 'category_disabled' });
    assert.deepEqual(await sendAll(token, pushes), { sent: 3, retrying: 0, failed: 0, invalidated: 0 });
    assert.equal((await claim(claimToken())).length, 0, 'nothing else is due');

    // A lab releases 10 models: each device that wants them gets one summary. b1 has new models
    // off and gets nothing; c1's cap of 2 is not reached because a group counts once.
    const announce = async (models, offsetSeconds = -60) => {
        await db.exec(`insert into public.v2_models (model_slug, lab_slug, name) values ${models.map(([slug, lab, name]) => `('${slug}', '${lab}', '${name}')`).join(', ')}`);
        await asService(async () => {
            await db.exec(`insert into public.model_discovery_public_announcements (model_slug) values ${models.map(([slug]) => `('${slug}')`).join(', ')}`);
            for (const [index, [slug]] of models.entries()) {
                await db.query(`update public.model_discovery_public_announcements set status = 'announced', announced_at = now() + make_interval(secs => $2) where model_slug = $1`, [slug, offsetSeconds + index + 1]);
            }
        });
    };
    const deepseek = ['V5', 'V5 Lite', 'V5 Coder', 'V5 Math', 'V5 Vision', 'V5 Audio', 'V5 Long', 'V5 Mini', 'V5 Nano', 'V5 Pro'];
    await announce(deepseek.map(name => [`deepseek/${name.toLowerCase().replace(/ /g, '-')}`, 'deepseek', `DeepSeek ${name}`]));
    assert.deepEqual(await fanOut(), { queued: 40, deferred: 0, suppressed: 0 }, 'a1, a2, c1 and f1 each queue all ten');
    assert.equal((await one(`select count(*)::int n from public.mobile_push_deliveries where device_id = ${device('b1')} and group_key = 'release:deepseek'`)).n, 0);
    assert.ok((await one(`select bool_and(not_before > now() + interval '3 minutes' and not_before <= now() + interval '5 minutes') ok from public.mobile_push_deliveries where group_key = 'release:deepseek'`)).ok,
        'each waits five minutes after its event');
    assert.equal((await claim(claimToken())).length, 0, 'nothing is sent while the burst settles');
    await settle(`group_key = 'release:deepseek'`);
    token = claimToken();
    pushes = byDevice(await claim(token));
    assert.deepEqual(Object.keys(pushes).sort(), ['a1', 'a2', 'c1', 'f1']);
    for (const push of Object.values(pushes)) {
        assert.deepEqual([push.kind, push.category, push.model_slug, push.title, push.body, push.href, push.group_key, push.group_count, push.tag, push.deliveries], [
            'model_released', 'new-models', null, 'DeepSeek released 10 models', 'DeepSeek V5, V5 Lite, V5 Coder and 7 more', '/organisations/deepseek',
            'release:deepseek', 10, `release:deepseek:${today}`, 10,
        ]);
    }
    assert.deepEqual(await one(`select count(*) filter (where merged_into = $1)::int carried, count(*) filter (where merged_into is null)::int own
      from public.mobile_push_deliveries where device_id = ${device('a1')} and group_key = 'release:deepseek'`, [pushes.a1.id]), { carried: 9, own: 1 });
    // A result applies to every row the push carried; only the push's own row holds the ticket.
    // f1's push is retried, so its rows go back to the queue to be grouped again.
    assert.deepEqual(await complete(token, [
        { id: pushes.a1.id, status: 'sent', ticketId: 'ticket-a1' }, { id: pushes.a2.id, status: 'sent', ticketId: 'ticket-a2' },
        { id: pushes.c1.id, status: 'sent', ticketId: 'ticket-c1' }, { id: pushes.f1.id, status: 'retry', errorCode: 'MessageRateExceeded' },
    ]), { sent: 3, retrying: 1, failed: 0, invalidated: 0 });
    assert.deepEqual(await one(`select count(*) filter (where status = 'sent')::int sent, count(expo_ticket_id)::int tickets, count(sent_at)::int sent_at
      from public.mobile_push_deliveries where device_id = ${device('a1')} and group_key = 'release:deepseek'`), { sent: 10, tickets: 1, sent_at: 10 });
    assert.deepEqual(await one(`select count(*) filter (where status = 'pending' and merged_into is null and not_before > now())::int n
      from public.mobile_push_deliveries where device_id = ${device('f1')} and group_key = 'release:deepseek'`), { n: 10 });
    assert.equal((await claim(claimToken())).length, 0, 'a retry waits for its backoff');
    await settle(`device_id = ${device('f1')}`);
    token = claimToken();
    pushes = byDevice(await claim(token));
    assert.deepEqual([Object.keys(pushes), pushes.f1.title, pushes.f1.attempts, pushes.f1.deliveries], [['f1'], 'DeepSeek released 10 models', 2, 10]);
    await complete(token, [{ id: pushes.f1.id, status: 'sent', ticketId: 'ticket-f1' }]);
    // A failed receipt fails every row the push carried.
    await db.exec(`update public.mobile_push_deliveries set sent_at = now() - interval '20 minutes' where device_id = ${device('f1')} and group_key = 'release:deepseek'`);
    const receipts = await asService(() => rows('select * from public.claim_mobile_push_receipts(100)'));
    const f1Receipt = receipts.find(receipt => receipt.expo_ticket_id === 'ticket-f1');
    assert.ok(f1Receipt, 'the push has one ticket to check');
    assert.equal(receipts.filter(receipt => receipt.expo_ticket_id === 'ticket-f1').length, 1);
    assert.deepEqual((await asService(() => one('select public.record_mobile_push_receipts($1) r', [JSON.stringify([{ id: f1Receipt.id, status: 'error', errorCode: 'MessageTooBig' }])]))).r,
        { checked: 1, failed: 1, invalidated: 0 });
    assert.deepEqual(await rows(`select distinct status, error_code from public.mobile_push_deliveries where device_id = ${device('f1')} and group_key = 'release:deepseek'`),
        [{ status: 'failed', error_code: 'MessageTooBig' }]);

    // Two or three models are named. A group waits while one of its rows is still settling, until
    // its oldest row has been due for ten minutes; then the rows that are due go, and the rest
    // follow in a push that counts everything sent to the device for the group today.
    await announce([['openai/gpt-6-astra', 'openai', 'GPT-6 Astra'], ['openai/gpt-6-astra-pro', 'openai', 'GPT-6 Astra Pro']]);
    await fanOut();
    await settle(`group_key = 'release:openai'`);
    await announce([['openai/gpt-6-astra-mini', 'openai', 'GPT-6 Astra Mini']], -1);
    await fanOut();
    assert.equal((await claim(claimToken())).length, 0, 'the group waits for Astra Mini to settle');
    await settle(`group_key = 'release:openai' and not_before <= now()`, 10);
    token = claimToken();
    pushes = byDevice(await claim(token));
    assert.deepEqual(Object.keys(pushes).sort(), ['a1', 'a2', 'f1']);
    assert.deepEqual([pushes.a1.title, pushes.a1.body, pushes.a1.href, pushes.a1.group_count, pushes.a1.deliveries],
        ['OpenAI released GPT-6 Astra and GPT-6 Astra Pro', 'See the details on Phaseo.', '/organisations/openai', 2, 2]);
    await sendAll(token, pushes);
    await settle(`group_key = 'release:openai'`);
    token = claimToken();
    pushes = byDevice(await claim(token));
    assert.deepEqual([pushes.a1.title, pushes.a1.group_count, pushes.a1.tag, pushes.a1.deliveries],
        ['OpenAI released GPT-6 Astra, GPT-6 Astra Pro and GPT-6 Astra Mini', 3, `release:openai:${today}`, 1]);
    await sendAll(token, pushes);

    // A later DeepSeek burst the same day replaces the notification with a cumulative one, and
    // c1 (cap 2, DeepSeek only) still receives it: the first ten counted once.
    await announce([['deepseek/v5-chat', 'deepseek', 'DeepSeek V5 Chat'], ['deepseek/v5-reasoner', 'deepseek', 'DeepSeek V5 Reasoner']]);
    assert.deepEqual(await fanOut(), { queued: 8, deferred: 0, suppressed: 0 });
    await settle(`group_key = 'release:deepseek'`);
    token = claimToken();
    pushes = byDevice(await claim(token));
    assert.deepEqual(Object.keys(pushes).sort(), ['a1', 'a2', 'c1', 'f1']);
    assert.deepEqual([pushes.a1.title, pushes.a1.body, pushes.a1.group_count, pushes.a1.tag, pushes.a1.deliveries],
        ['DeepSeek released 12 models', 'DeepSeek V5, V5 Lite, V5 Coder and 9 more', 12, `release:deepseek:${today}`, 2]);
    assert.deepEqual([pushes.c1.title, pushes.c1.group_count], ['DeepSeek released 12 models', 12]);
    assert.deepEqual([pushes.f1.title, pushes.f1.group_count], ['DeepSeek released DeepSeek V5 Chat and V5 Reasoner', 2], "f1's first ten failed, so they are not counted");
    await sendAll(token, pushes);

    // A provider launching 40 models in one transaction is one provider_launched event; a bulk
    // resync for a provider already on Phaseo, and a bulk reprice, are skipped as before.
    await db.exec(`
      insert into public.v2_models (model_slug, lab_slug, name, released_at)
        select 'open/model-' || n, 'open', 'Open Model ' || n, now() - make_interval(days => n) from generate_series(1, 40) n;
      insert into public.v2_model_provider_routes (provider_model_id, model_slug, provider_slug, routing_enabled)
        select 'groq:model-' || n, 'open/model-' || n, 'groq', true from generate_series(1, 40) n;
      insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code)
        select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'groq:model-' || n, 'standard' from generate_series(1, 40) n;
      insert into public.v2_pricing_sku_meters (sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit)
        select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'input_tokens', 'text', 'input', 'token', 1000000, 100000000, 'Input tokens', '1M tokens'
        from generate_series(1, 40) n;
    `);
    await capture();
    const launched = await capture();
    assert.deepEqual([launched.emitted, launched.skippedTransactions], [1, 1]);
    assert.deepEqual(await one(`select kind, provider_slug, model_slug, lab_slug, title, body, href, payload ->> 'modelCount' model_count
      from public.catalogue_notification_events where kind = 'provider_launched'`), {
        kind: 'provider_launched', provider_slug: 'groq', model_slug: null, lab_slug: null, title: 'Groq is now on Phaseo',
        body: '40 models, including Open Model 1, Open Model 2 and Open Model 3.', href: '/api-providers/groq', model_count: '40',
    });
    await db.exec(`
      insert into public.v2_models (model_slug, lab_slug, name) select 'qwen/resync-' || n, 'qwen', 'Resync ' || n from generate_series(1, 25) n;
      insert into public.v2_model_provider_routes (provider_model_id, model_slug, provider_slug, routing_enabled)
        select 'deepinfra:resync-' || n, 'qwen/resync-' || n, 'deepinfra', true from generate_series(1, 25) n;
    `);
    await db.exec(`update public.v2_pricing_sku_meters set price_nanos = price_nanos * 2 where sku_id::text like '20000000-%'`);
    await capture();
    const skipped = await capture();
    assert.deepEqual([skipped.emitted, skipped.skippedTransactions], [0, 2], 'a bulk resync and a bulk reprice are skipped');
    assert.equal((await one(`select count(*)::int n from public.catalogue_notification_events where kind = 'provider_launched'`)).n, 1);

    // Rules about Phaseo availability or new providers match it; a rule only about releases, or
    // only about one lab, does not. It goes alone and untagged, as prices and providers.
    assert.deepEqual(await fanOut(), { queued: 5, deferred: 0, suppressed: 0 });
    await settle(`event_id = (select id from public.catalogue_notification_events where kind = 'provider_launched')`);
    token = claimToken();
    pushes = byDevice(await claim(token));
    assert.deepEqual(Object.keys(pushes).sort(), ['a1', 'a2', 'b1', 'd1', 'e1']);
    assert.deepEqual({ ...pushes.d1, id: null, expo_push_token: null }, {
        id: null, attempts: 1, expo_push_token: null, channel_scheme: 2, kind: 'provider_launched', category: 'prices-providers', model_slug: null,
        title: 'Groq is now on Phaseo', body: '40 models, including Open Model 1, Open Model 2 and Open Model 3.', href: '/api-providers/groq',
        group_key: null, group_count: null, tag: null, deliveries: 1,
    });
    assert.equal(pushes.a2.channel_scheme, 1);
    await sendAll(token, pushes);

    // Repeated price changes to one model are one push. c1 is at its cap of 2 and is suppressed;
    // u1 switches prices off before the push is due, so a1 and a2 are closed when it is claimed.
    await db.exec(`update public.v2_pricing_sku_meters set price_nanos = 140000000 where meter_key = 'input_tokens' and sku_id = '10000000-0000-4000-8000-000000000001'`);
    await db.exec(`update public.v2_pricing_sku_meters set price_nanos = 560000000 where meter_key = 'output_tokens' and sku_id = '10000000-0000-4000-8000-000000000001'`);
    await capture();
    assert.equal((await capture()).emitted, 2);
    assert.deepEqual(await fanOut(), { queued: 6, deferred: 0, suppressed: 2 });
    assert.deepEqual(await rows(`select distinct status, error_code from public.mobile_push_deliveries where device_id = ${device('c1')} and group_key like 'price:%'`),
        [{ status: 'suppressed', error_code: 'daily_cap' }]);
    await setCategories(1, { 'prices-providers': false });
    await settle(`group_key = 'price:deepseek/deepseek-v4'`);
    token = claimToken();
    pushes = byDevice(await claim(token));
    assert.deepEqual(Object.keys(pushes), ['b1']);
    assert.deepEqual([pushes.b1.kind, pushes.b1.category, pushes.b1.model_slug, pushes.b1.title, pushes.b1.body, pushes.b1.href, pushes.b1.group_count, pushes.b1.tag], [
        'price_changed', 'prices-providers', 'deepseek/deepseek-v4', 'DeepSeek V4 prices changed',
        'DeepSeek V4 output price rose from $0.42 to $0.56 per 1M tokens at DeepSeek. 1 other change today.', '/models/deepseek/deepseek-v4', 2,
        `price:deepseek/deepseek-v4:${today}`,
    ]);
    assert.deepEqual(await rows(`select distinct status, error_code from public.mobile_push_deliveries where device_id in (${device('a1')}, ${device('a2')}) and group_key like 'price:%'`),
        [{ status: 'suppressed', error_code: 'category_disabled' }]);
    await complete(token, [{ id: pushes.b1.id, status: 'sent', ticketId: 'ticket-b1-price' }]);

    // A category that is off is not even queued.
    await db.exec(`update public.v2_pricing_sku_meters set price_nanos = 70000000 where meter_key = 'input_tokens' and sku_id = '10000000-0000-4000-8000-000000000001'`);
    await capture();
    assert.equal((await capture()).emitted, 1);
    assert.deepEqual(await fanOut(), { queued: 1, deferred: 0, suppressed: 1 }, 'b1 queues it and c1 is capped; a1 and a2 are skipped');

    // Group messages for providers and Phaseo availability.
    const message = async (key, items) => (await one('select private.mobile_push_group_message($1, $2) m', [key, JSON.stringify(items)])).m;
    const item = (kind, modelSlug, modelName, extra = {}) => ({
        kind, modelSlug, modelName, labSlug: modelSlug.split('/')[0], labName: null, providerSlug: 'groq', providerName: 'Groq',
        title: `${modelName} title`, body: 'body', href: `/models/${modelSlug}`, ...extra,
    });
    assert.deepEqual(await message('provider:groq', [item('provider_added', 'meta/llama-5', 'Llama 5'), item('provider_added', 'qwen/qwen3-max', 'Qwen3 Max')]), {
        kind: 'provider_added', modelSlug: null, title: 'Llama 5 and Qwen3 Max are now available from Groq', body: 'Groq is now a provider for them on Phaseo.',
        href: '/api-providers/groq', count: 2,
    });
    assert.deepEqual(await message('provider:groq', ['a', 'b', 'c', 'd', 'e'].map(x => item('provider_added', `meta/m-${x}`, `Model ${x}`))), {
        kind: 'provider_added', modelSlug: null, title: '5 models are now available from Groq', body: 'Model a, Model b, Model c and 2 more',
        href: '/api-providers/groq', count: 5,
    });
    assert.deepEqual(await message('release:qwen', ['Qwen 4', 'Qwen 4 Plus', 'Qwen 4 Flash'].map(name => item('gateway_available', `qwen/${name}`, name, { labName: 'Qwen' }))), {
        kind: 'gateway_available', modelSlug: null, title: 'Qwen 4, 4 Plus and 4 Flash are now on Phaseo', body: 'You can now use them through Phaseo.',
        href: '/organisations/qwen', count: 3,
    });
    assert.equal((await message('release:qwen', [1, 2, 3, 4].map(n => item('gateway_available', `qwen/q${n}`, `Q${n}`, { labName: 'Qwen' })))).title, '4 Qwen models are now on Phaseo');
    assert.deepEqual(await message('release:qwen', [item('gateway_available', 'qwen/q1', 'Q1'), item('model_released', 'qwen/q1', 'Q1')]),
        { kind: 'model_released', modelSlug: 'qwen/q1', title: 'Q1 title', body: 'body', href: '/models/qwen/q1', count: 1 }, 'one model told about twice is one model');

    // Quiet hours are judged at the moment a push stops settling: one starting in two minutes
    // holds a release announced now until they end.
    await db.exec(`
      update public.mobile_notification_preferences set enabled = true,
        quiet_start = ((now() at time zone 'UTC') + interval '2 minutes')::time, quiet_end = ((now() at time zone 'UTC') + interval '2 hours')::time
        where user_id = '${user(7)}';
      insert into public.mobile_notification_rules (user_id, event_kinds) values ('${user(7)}', '{model_released}');
    `);
    await announce([['qwen/qwen4', 'qwen', 'Qwen 4']], -1);
    await fanOut();
    assert.deepEqual(await one(`select status, not_before > now() + interval '119 minutes' and not_before < now() + interval '121 minutes' as after_quiet_hours
      from public.mobile_push_deliveries where device_id = ${device('x9')}`), { status: 'deferred', after_quiet_hours: true });

    // The test push reports the device's channel scheme.
    const a2 = (await one(`select id from public.mobile_push_devices where installation_id = 'install-a2'`)).id;
    assert.deepEqual(await asService(async () => (await one(`select public.claim_mobile_push_test($1, 'install-a2') r`, [user(1)])).r),
        { deviceId: a2, expoPushToken: pushToken('a2'), channelScheme: 1 });

    // Backend only.
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query(`select public.update_mobile_notification_categories($1, '{}')`, [user(1)]), /permission denied/);
        await assert.rejects(db.query(`select public.register_mobile_push_device($1, 'install-y', $2, 'android', null, null, null, 2)`, [user(1), pushToken('y')]), /permission denied/);
        await assert.rejects(db.query('select * from public.claim_mobile_push_deliveries(10, $1)', [claimToken()]), /permission denied/);
        await db.exec('reset role');
    }
    console.log('mobile push v2: ok');
} finally {
    await db.close();
}
