import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const actor = 'aaaaaaaa-7777-4444-8888-000000000001';
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const revision = async () => Number((await rows('select revision from private.routing_catalogue_revision'))[0].revision);
const version = async (slug = 'declared') =>
  (await rows('select rate_limits_updated_at::text as v from public.provider_catalog_sources where provider_slug=$1', [slug]))[0].v;
const save = (limits, { expected = null, check = true, actorId = actor, kind = 'provider', slug = 'declared' } = {}) =>
  rows('select public.save_provider_rate_limits($1,$2,$3,$4::timestamptz,$5::jsonb,$6)::text as v', [slug, actorId, kind, expected, JSON.stringify(limits), check]);
const limits = (slug = 'declared') => rows(
  `select provider_model_slug as model, requests_per_minute::int as rpm, requests_per_day::int as rpd,
     tokens_per_minute::int as tpm, tokens_per_day::int as tpd, headroom_bps, enabled
   from public.provider_rate_limits where provider_id=$1 order by provider_model_slug`, [slug]);

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private;
    create table private.routing_catalogue_revision (singleton boolean primary key default true, revision bigint not null default 0);
    insert into private.routing_catalogue_revision default values;
    create table public.users (user_id uuid primary key, display_name text);
    create table public.v2_providers (provider_slug text primary key);
    create table public.provider_catalog_sources (
      provider_slug text primary key references public.v2_providers(provider_slug),
      management_mode text not null default 'remote', updated_at timestamptz not null default now()
    );
    create table public.provider_catalog_edit_events (
      id uuid primary key default gen_random_uuid(), provider_slug text not null, model_slug text not null, field text not null,
      actor_id uuid, actor_kind text not null check (actor_kind in ('phaseo','provider')), actor_name text,
      action text not null check (action in ('override','revert')), previous_value jsonb, value jsonb, created_at timestamptz not null default now()
    );
    create table public.provider_rate_limits (
      provider_id text not null references public.v2_providers(provider_slug),
      provider_model_slug text not null default '*',
      requests_per_minute bigint, requests_per_day bigint, tokens_per_minute bigint, tokens_per_day bigint,
      headroom_bps integer not null default 500, enabled boolean not null default true,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      constraint provider_rate_limits_has_limit check (requests_per_minute is not null or requests_per_day is not null or tokens_per_minute is not null or tokens_per_day is not null),
      primary key (provider_id, provider_model_slug)
    );
    grant select, insert, update, delete on public.provider_rate_limits, public.provider_catalog_sources to service_role;
    grant select, insert on public.provider_catalog_edit_events to service_role;
    grant select on public.users to service_role;
    -- Read access for assertions only; the trigger function runs as its definer.
    grant usage on schema private to service_role;
    grant select on private.routing_catalogue_revision to service_role;
  `);
  await db.exec(await readFile(new URL('../schemas/private/functions/invalidate_routing_catalogue.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261010102600_provider_declared_rate_limits.sql', import.meta.url), 'utf8'));
  await db.exec(`
    insert into public.users values ('${actor}', 'Provider Owner');
    insert into public.v2_providers values ('declared'), ('other');
    insert into public.provider_catalog_sources(provider_slug) values ('declared'), ('other');
    insert into public.provider_rate_limits(provider_id, provider_model_slug, requests_per_minute) values ('other', '*', 9);
  `);

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(save([{ requests_per_minute: 1 }]), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');

  // First declaration: the expected version is null until limits exist.
  let before = await revision();
  const [{ v: first }] = await save([
    { requests_per_minute: 600, tokens_per_minute: 1_000_000 },
    { model: 'model-b', requests_per_day: 10_000 },
    { model: 'model-a', tokens_per_day: 50_000_000 },
  ]);
  assert.ok(first);
  assert.equal(await version(), first);
  assert.ok(await revision() > before, 'limit writes bump the routing catalogue revision');
  assert.deepEqual((await limits()).map(({ model, rpm, rpd, tpm, tpd, enabled }) => ({ model, rpm, rpd, tpm, tpd, enabled })), [
    { model: '*', rpm: 600, rpd: null, tpm: 1_000_000, tpd: null, enabled: true },
    { model: 'model-a', rpm: null, rpd: null, tpm: null, tpd: 50_000_000, enabled: true },
    { model: 'model-b', rpm: null, rpd: 10_000, tpm: null, tpd: null, enabled: true },
  ]);
  const [event] = await rows("select * from public.provider_catalog_edit_events where field='$rate_limits'");
  assert.equal(event.model_slug, '*');
  assert.equal(event.actor_kind, 'provider');
  assert.equal(event.actor_name, 'Provider Owner');
  assert.deepEqual(event.previous_value, []);
  assert.equal(event.value.length, 3);

  // A stale version is rejected and changes nothing.
  await assert.rejects(save([{ requests_per_minute: 1 }]), /provider_catalog_version_conflict/);
  await assert.rejects(save([{ requests_per_minute: 1 }], { expected: '2020-01-01T00:00:00Z' }), /provider_catalog_version_conflict/);
  assert.equal((await limits()).length, 3);

  // Replacement deletes omitted scopes, updates kept ones and preserves operational headroom.
  await db.exec('reset role');
  await db.exec("update public.provider_rate_limits set headroom_bps=900, enabled=false where provider_id='declared' and provider_model_slug='model-a'");
  await db.exec('set role service_role');
  const [{ v: second }] = await save([{ model: 'model-a', tokens_per_day: 40_000_000 }], { expected: first });
  assert.notEqual(second, null);
  assert.deepEqual((await limits()).map(({ model, tpd, headroom_bps, enabled }) => ({ model, tpd, headroom_bps, enabled })), [
    { model: 'model-a', tpd: 40_000_000, headroom_bps: 900, enabled: true },
  ]);
  assert.deepEqual(await limits('other'), [{ model: '*', rpm: 9, rpd: null, tpm: null, tpd: null, headroom_bps: 500, enabled: true }], 'other providers are untouched');

  // Unchanged declarations (feed re-imports) are no-ops: no audit row, no revision bump.
  before = await revision();
  const events = (await rows("select count(*)::int as n from public.provider_catalog_edit_events")) [0].n;
  const [{ v: unchanged }] = await save([{ model: 'model-a', tokens_per_day: 40_000_000 }], { check: false, actorId: null });
  assert.equal(unchanged, await version());
  assert.equal(await revision(), before);
  assert.equal((await rows("select count(*)::int as n from public.provider_catalog_edit_events"))[0].n, events);

  // Feed imports replace without a version, attributed to the provider.
  await save([], { check: false, actorId: null });
  assert.deepEqual(await limits(), []);
  const [feedEvent] = await rows("select actor_id, actor_kind from public.provider_catalog_edit_events order by created_at desc, value::text asc limit 1");
  assert.equal(feedEvent.actor_kind, 'provider');

  // Console writes need an actor even when they skip nothing.
  await assert.rejects(save([{ requests_per_minute: 1 }], { expected: await version(), actorId: null }), /provider_catalog_actor_required/);
  await assert.rejects(save([{ requests_per_minute: 1 }], { expected: await version(), kind: 'feed' }), /provider_catalog_actor_required/);

  // Invalid declarations.
  const current = await version();
  for (const [payload, error] of [
    [[{ requests_per_minute: 0 }], /provider_rate_limits_invalid/],
    [[{ requests_per_minute: 1.5 }], /provider_rate_limits_invalid/],
    [[{ requests_per_minute: '10' }], /provider_rate_limits_invalid/],
    [[{ model: '', requests_per_minute: 1 }], /provider_rate_limits_invalid/],
    [[{ model: 'x', burst: 1 }], /provider_rate_limits_invalid/],
    [[{ model: 'x' }], /provider_rate_limits_empty_scope/],
    [[{ requests_per_minute: 1 }, { model: '*', tokens_per_day: 1 }], /provider_rate_limits_duplicate_scope/],
    [{ requests_per_minute: 1 }, /provider_rate_limits_invalid/],
  ]) await assert.rejects(save(payload, { expected: current }), error, JSON.stringify(payload));
  await assert.rejects(save([{ requests_per_minute: 1 }], { slug: 'missing', check: false, actorId: null }), /provider_catalog_source_not_found/);
  console.log('provider declared rate limit contract passed');
} finally {
  await db.close();
}
