import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();

try {
  await db.exec(`
    create table public.v2_providers (
      provider_slug text primary key,
      metadata jsonb not null
    );
    create table public.v2_model_provider_routes (
      provider_model_id text primary key,
      provider_slug text not null,
      metadata jsonb not null
    );
    create function public.gateway_fetch_request_context_without_workspace_budget(
      workspace_id uuid, model text, endpoint text, api_key_id uuid
    ) returns jsonb language plpgsql as $function$
    declare selected_availability jsonb;
    begin
      select coalesce((select route.metadata -> 'availability' from public.v2_model_provider_routes route where route.provider_model_id = m.provider_api_model_id), p.metadata -> 'availability')
      into selected_availability
      from (select provider_model_id as provider_api_model_id, provider_slug from public.v2_model_provider_routes) m
      join public.v2_providers p on p.provider_slug = m.provider_slug
      where m.provider_api_model_id = model;
      return selected_availability;
    end
    $function$;
    create function public.gateway_fetch_public_catalog(p_model text, p_endpoints text[])
    returns jsonb language plpgsql as $function$
    declare selected_availability jsonb;
    begin
      select coalesce(r.metadata->'availability',p.metadata->'availability')
      into selected_availability
      from public.v2_model_provider_routes r
      join public.v2_providers p on p.provider_slug = r.provider_slug
      where r.provider_model_id = p_model;
      return selected_availability;
    end
    $function$;
    insert into public.v2_providers values
      ('openai', '{"availability":{"mode":"allowlist","countries":["GB"]}}');
    insert into public.v2_model_provider_routes values
      ('lifecycle-object', 'openai', '{"availability":{"status":"available"}}'),
      ('lifecycle-string', 'openai', '{"availability":"available"}'),
      ('route-policy', 'openai', '{"availability":{"mode":"blocklist","countries":["US"]}}');
  `);

  const migration = await readFile(
    new URL('../migrations/20260929121800_ignore_non_geographic_route_availability.sql', import.meta.url),
    'utf8',
  );
  await db.exec(migration);
  await db.exec(migration);

  for (const [route, mode, country] of [
    ['lifecycle-object', 'allowlist', 'GB'],
    ['lifecycle-string', 'allowlist', 'GB'],
    ['route-policy', 'blocklist', 'US'],
  ]) {
    for (const query of [
      'select public.gateway_fetch_request_context_without_workspace_budget(null, $1, null, null) as availability',
      'select public.gateway_fetch_public_catalog($1, array[\'responses\']) as availability',
    ]) {
      const result = await db.query(query, [route]);
      assert.equal(result.rows[0].availability.mode, mode);
      assert.deepEqual(result.rows[0].availability.countries, [country]);
    }
  }
} finally {
  await db.close();
}
