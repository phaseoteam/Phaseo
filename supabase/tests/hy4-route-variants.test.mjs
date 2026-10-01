import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../migrations/20260918230607_add_standard_hy4_route_variants.sql', import.meta.url),
  'utf8',
);
const routes = ['novita:tencent/hy4-preview', 'tencent-cloud:hy4-preview'];

for (const presentRoutes of [[], [routes[0]], [routes[1]], routes]) {
  test(`restores HY4 variants with parents: ${presentRoutes.join(', ') || 'none'}`, async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create table public.v2_model_provider_routes (provider_model_id text primary key);
        create table public.v2_service_tiers (service_tier_slug text primary key);
        insert into public.v2_service_tiers values ('standard');
        create table public.v2_route_variants (
          variant_id uuid primary key default gen_random_uuid(),
          provider_model_id text not null references public.v2_model_provider_routes,
          variant_key text not null,
          service_tier_slug text not null references public.v2_service_tiers,
          status text not null check (status in ('active', 'degraded', 'disabled', 'retired')),
          routing_enabled boolean not null,
          endpoint_label text,
          metadata jsonb not null default '{}',
          updated_at timestamptz not null default now(),
          unique (provider_model_id, variant_key)
        );
        create table public.v2_pricing_skus (
          provider_model_id text not null references public.v2_model_provider_routes,
          service_tier_slug text not null references public.v2_service_tiers,
          route_variant_id uuid references public.v2_route_variants,
          updated_at timestamptz not null default now()
        );
      `);
      for (const route of presentRoutes) {
        await db.query('insert into public.v2_model_provider_routes values ($1)', [route]);
        await db.query(
          'insert into public.v2_pricing_skus (provider_model_id, service_tier_slug) values ($1, $2)',
          [route, 'standard'],
        );
      }
      await db.exec(migration);
      const variants = (await db.query(`
        select provider_model_id, variant_key, status, routing_enabled
        from public.v2_route_variants order by provider_model_id
      `)).rows;
      assert.deepEqual(variants, presentRoutes.map((route) => ({
        provider_model_id: route,
        variant_key: 'global:standard',
        status: route === routes[0] ? 'active' : 'disabled',
        routing_enabled: route === routes[0],
      })));
      const linked = (await db.query(`
        select sku.provider_model_id, sku.route_variant_id
        from public.v2_pricing_skus sku
        join public.v2_route_variants variant
          on variant.variant_id = sku.route_variant_id
          and variant.provider_model_id = sku.provider_model_id
          and variant.service_tier_slug = sku.service_tier_slug
        order by sku.provider_model_id
      `)).rows;
      assert.equal(linked.length, presentRoutes.length);
      await db.exec(migration);
      assert.deepEqual((await db.query(`
        select provider_model_id, route_variant_id
        from public.v2_pricing_skus order by provider_model_id
      `)).rows, linked);
      assert.equal((await db.query('select count(*)::int as count from public.v2_route_variants')).rows[0].count, presentRoutes.length);
    } finally {
      await db.close();
    }
  });
}
