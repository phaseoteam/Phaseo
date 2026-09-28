import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../migrations/20260928210000_prepare_claude_sonnet_55_release.sql', import.meta.url),
  'utf8',
);
const providers = [
  'anthropic', 'anthropic-us', 'anthropic-aws', 'anthropic-aws-us',
  'amazon-bedrock', 'google-vertex', 'google-vertex-eu',
];

test('Sonnet 5.5 release creates complete provider routes and is idempotent', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.v2_models (
        model_slug text primary key, lab_slug text, name text, description text,
        status text, hidden boolean, input_modalities text[], output_modalities text[],
        family_slug text, announced_at timestamptz, released_at timestamptz,
        metadata jsonb, catalogue_status text
      );
      create table public.v2_model_provider_routes (
        provider_model_id text primary key, model_slug text, provider_slug text,
        provider_model_slug text, status text, routing_enabled boolean,
        input_modalities text[], output_modalities text[], regions text[],
        context_length integer, max_output_tokens integer, effective_from timestamptz,
        metadata jsonb, provider_availability_status text, phaseo_status text,
        access_scope text, is_stealth boolean, credential_mode text
      );
      create table public.v2_route_variants (
        variant_id uuid primary key default gen_random_uuid(),
        provider_model_id text, variant_key text, provider_region_id uuid,
        execution_region text, data_region text, service_tier_slug text,
        status text, routing_enabled boolean, endpoint_label text, metadata jsonb,
        unique(provider_model_id, variant_key)
      );
      create table public.v2_route_capabilities (
        provider_model_id text, capability_id text, status text,
        max_input_tokens integer, max_output_tokens integer, params jsonb,
        effective_from timestamptz, metadata jsonb,
        primary key(provider_model_id, capability_id)
      );
      create table public.v2_pricing_skus (
        sku_id uuid primary key default gen_random_uuid(),
        provider_model_id text, sku_code text, version integer, operation text,
        status text, region text, display_name text, description text, currency text,
        effective_from timestamptz, effective_to timestamptz, metadata jsonb,
        service_tier_slug text, route_variant_id uuid,
        unique(provider_model_id, sku_code, version)
      );
      create table public.v2_pricing_sku_meters (
        sku_id uuid, meter_key text, modality text, direction text, unit text,
        unit_quantity numeric, price_nanos numeric, display_label text,
        display_unit text, billable boolean, meter_order integer, metadata jsonb,
        unique(sku_id, meter_key)
      );
      create table public.v2_model_aliases (
        alias_slug text primary key, model_slug text, alias_type text,
        enabled boolean, metadata jsonb, updated_at timestamptz default now()
      );
      create table public.v2_model_page_notices (
        model_slug text primary key, tone text, markdown text,
        updated_at timestamptz default now()
      );
      insert into public.v2_models (model_slug, lab_slug, name, status)
      values ('anthropic/claude-sonnet-5', 'anthropic', 'Claude Sonnet 5', 'active');
    `);

    for (const provider of providers) {
      const oldId = `${provider}:anthropic/claude-sonnet-5`;
      const slug = provider === 'amazon-bedrock' ? 'anthropic.claude-sonnet-5' : 'claude-sonnet-5';
      await db.query(`
        insert into public.v2_model_provider_routes (
          provider_model_id, model_slug, provider_slug, provider_model_slug,
          status, routing_enabled, input_modalities, output_modalities, regions,
          metadata, provider_availability_status, phaseo_status, access_scope,
          is_stealth, credential_mode
        ) values ($1, 'anthropic/claude-sonnet-5', $2, $3, 'active', true,
          array['text','image'], array['text'], array['global'], '{}'::jsonb,
          'available', 'enabled', 'public', false, 'managed_and_byok')
      `, [oldId, provider, slug]);
      await db.query(`
        insert into public.v2_route_variants (
          provider_model_id, variant_key, service_tier_slug, status,
          routing_enabled, metadata
        ) values ($1, 'global:standard', 'standard', 'active', true, '{}'::jsonb)
      `, [oldId]);
      await db.query(`
        insert into public.v2_route_capabilities (
          provider_model_id, capability_id, status, params, metadata
        ) values ($1, 'text.generate', 'active', '[]'::jsonb, '{}'::jsonb)
      `, [oldId]);
      await db.query(`
        insert into public.v2_pricing_skus (
          provider_model_id, sku_code, version, operation, status, display_name,
          currency, effective_from, metadata, service_tier_slug
        ) values ($1, $2, 1, 'text.generate', 'active', 'Claude Sonnet 5',
          'USD', '2026-06-30T00:00:00Z', '{}'::jsonb, 'standard')
      `, [oldId, `${provider}:sonnet-5:standard`]);
      await db.query(`
        insert into public.v2_pricing_sku_meters (
          sku_id, meter_key, modality, direction, unit, unit_quantity,
          price_nanos, display_label, display_unit, billable, meter_order,
          metadata
        ) select sku_id, 'input_text_tokens', 'text', 'input', 'token',
          1000000, 2000000000, 'Input text tokens', '1M tokens', true, 100,
          '{}'::jsonb from public.v2_pricing_skus where provider_model_id = $1
      `, [oldId]);
    }

    await db.exec(migration);
    await db.exec(migration);
    const routes = (await db.query(`
      select provider_slug, provider_model_slug, routing_enabled
      from public.v2_model_provider_routes
      where model_slug = 'anthropic/claude-sonnet-5.5'
      order by provider_slug
    `)).rows;
    assert.equal(routes.length, providers.length);
    assert.ok(routes.every((route) => route.routing_enabled));
    assert.equal(routes.find((route) => route.provider_slug === 'amazon-bedrock').provider_model_slug,
      'anthropic.claude-sonnet-5-5');
    assert.equal((await db.query(`
      select count(*)::int as count from public.v2_pricing_sku_meters meter
      join public.v2_pricing_skus sku on sku.sku_id = meter.sku_id
      where sku.provider_model_id like '%claude-sonnet-5.5'
    `)).rows[0].count, providers.length);
    assert.equal((await db.query(`
      select model_slug from public.v2_model_aliases
      where alias_slug = 'anthropic/claude-sonnet-latest'
    `)).rows[0].model_slug, 'anthropic/claude-sonnet-5.5');
  } finally {
    await db.close();
  }
});
