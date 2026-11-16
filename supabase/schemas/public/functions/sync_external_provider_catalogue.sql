CREATE OR REPLACE FUNCTION public.sync_external_provider_catalogue (
  p_provider_slug text,
  p_models        jsonb,
  p_now           timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
-- Applies one external provider's public /models list to its catalogue routes.
-- p_models: [{"id": upstream model id, "context_length": int|null, "max_output_tokens": int|null,
--             "meters": {"input_text_tokens": usd per 1M, "output_text_tokens": ..., ...}|null}]
-- Only external (non-routable) routes are touched, and a row is written only when a value changes.
-- Newly listed models get a route when their upstream ID resolves to exactly one catalogue model.
declare
  v_grace constant interval := interval '3 days';
  v_core_meters constant text[] := array['input_text_tokens','output_text_tokens','cached_read_text_tokens','cached_write_text_tokens'];
  v_route_count integer;
  v_seen_count integer;
  v_allow_removals boolean;
  v_limits_updated integer := 0;
  v_restored integer := 0;
  v_cleared integer := 0;
  v_newly_missing integer := 0;
  v_removed integer := 0;
  v_prices_changed integer := 0;
  v_prices_added integer := 0;
  v_prices_skipped integer := 0;
  v_unmatched jsonb;
  v_unmatched_count integer;
  v_added integer := 0;
  v_added_sample jsonb := '[]'::jsonb;
  r record;
  v_sku public.v2_pricing_skus%rowtype;
  v_new_sku uuid;
  v_active_count integer;
  v_changed boolean;
begin
  if not exists (select 1 from public.v2_providers where provider_slug = p_provider_slug and status = 'external') then
    raise exception 'provider % is not an external provider', p_provider_slug;
  end if;
  if jsonb_typeof(p_models) is distinct from 'array' then
    raise exception 'p_models must be a JSON array';
  end if;
  perform set_config('phaseo.catalogue_actor', '', true);

  drop table if exists pg_temp.external_sync_incoming;
  create temporary table external_sync_incoming on commit drop as
  select distinct on (lower(x->>'id'))
    lower(x->>'id') as key,
    x->>'id' as id,
    case when (x->>'context_length') ~ '^[0-9]+$' and (x->>'context_length')::bigint between 1 and 2147483647 then (x->>'context_length')::integer end as context_length,
    case when (x->>'max_output_tokens') ~ '^[0-9]+$' and (x->>'max_output_tokens')::bigint between 1 and 2147483647 then (x->>'max_output_tokens')::integer end as max_output_tokens,
    (
      select jsonb_object_agg(m.key, round((m.value #>> '{}')::numeric * 1000000000))
      from jsonb_each(case when jsonb_typeof(x->'meters') = 'object' then x->'meters' else '{}'::jsonb end) m
      where m.key = any(v_core_meters)
        and jsonb_typeof(m.value) = 'number'
        and (m.value #>> '{}')::numeric >= 0
    ) as meter_nanos
  from jsonb_array_elements(p_models) x
  where nullif(trim(x->>'id'), '') is not null
  order by lower(x->>'id');

  -- New listings: add a route when the upstream ID names exactly one catalogue model, by the model
  -- ID itself, an alias, another provider's route with the same upstream ID, or an organisation
  -- prefix this provider already uses for our models (for example zai/ for z-ai/). Variant IDs
  -- (:batch, :free, -batch, -fast ...) and aliases (~...) are left alone, and a model that already
  -- has a route on this provider never gets a second one.
  with prefix_pairs as (
    select lower(split_part(route.provider_model_slug, '/', 1)) as upstream_org, split_part(route.model_slug, '/', 1) as our_org, count(*) as uses
    from public.v2_model_provider_routes route
    where route.provider_slug = p_provider_slug
      and position('/' in route.provider_model_slug) > 0
      and position('/' in route.model_slug) > 0
      and lower(substr(route.provider_model_slug, position('/' in route.provider_model_slug) + 1)) = lower(substr(route.model_slug, position('/' in route.model_slug) + 1))
    group by 1, 2
  ),
  best_prefix as (
    select distinct on (upstream_org) upstream_org, our_org from prefix_pairs order by upstream_org, uses desc, our_org
  ),
  candidates as (
    select incoming.id, incoming.key, incoming.context_length, incoming.max_output_tokens,
      coalesce(exact.model_slug, alias.model_slug, other_route.model_slug, prefixed.model_slug) as model_slug,
      case when exact.model_slug is not null then 'model_id' when alias.model_slug is not null then 'alias'
        when other_route.model_slug is not null then 'other_provider_route' when prefixed.model_slug is not null then 'org_prefix' end as matched_by
    from external_sync_incoming incoming
    left join lateral (select model.model_slug from public.v2_models model where lower(model.model_slug) = incoming.key limit 1) exact on true
    left join lateral (
      select min(a.model_slug) as model_slug from public.v2_model_aliases a where lower(a.alias_slug) = incoming.key and a.enabled having count(distinct a.model_slug) = 1
    ) alias on true
    left join lateral (
      select min(other.model_slug) as model_slug from public.v2_model_provider_routes other
      where lower(other.provider_model_slug) = incoming.key having count(distinct other.model_slug) = 1
    ) other_route on true
    left join lateral (
      select model.model_slug from best_prefix prefix
      join public.v2_models model on lower(model.model_slug) = lower(prefix.our_org || '/' || substr(incoming.key, position('/' in incoming.key) + 1))
      where position('/' in incoming.key) > 0 and prefix.upstream_org = split_part(incoming.key, '/', 1)
      limit 1
    ) prefixed on true
    where incoming.key !~ '[:~]'
      and incoming.key !~ '-(batch|fast|ultrafast|beta|free)$'
      and not exists (
        select 1 from public.v2_model_provider_routes existing
        where existing.provider_slug = p_provider_slug and lower(existing.provider_model_slug) = incoming.key
      )
  ),
  additions as (
    select distinct on (candidate.model_slug) candidate.*, model.input_modalities, model.output_modalities
    from candidates candidate
    join public.v2_models model on model.model_slug = candidate.model_slug
    where not exists (
      select 1 from public.v2_model_provider_routes existing
      where existing.provider_slug = p_provider_slug and existing.model_slug = candidate.model_slug
    )
    order by candidate.model_slug, (candidate.matched_by = 'model_id') desc, candidate.key
    limit 200
  ),
  inserted as (
    insert into public.v2_model_provider_routes (provider_model_id, model_slug, provider_slug, provider_model_slug, status, routing_enabled,
      phaseo_status, provider_availability_status, access_scope, credential_mode, input_modalities, output_modalities, regions,
      context_length, max_output_tokens, effective_from, metadata)
    select p_provider_slug || ':' || addition.id, addition.model_slug, p_provider_slug, addition.id, 'active', false,
      'unsupported', 'available', 'public', 'managed_and_byok', addition.input_modalities, addition.output_modalities, array['global'],
      addition.context_length, addition.max_output_tokens, p_now,
      jsonb_build_object(
        'source', 'external_sync', 'routable', false, 'routing_status', 'active', 'service_tiers', '[]'::jsonb,
        'api', jsonb_build_object('formats', '[]'::jsonb, 'endpoint', null, 'deployment', null),
        'regions', jsonb_build_object('data', jsonb_build_array('global'), 'execution', jsonb_build_array('global')),
        'verification', jsonb_build_object('status', 'partial', 'notes', 'Added from the provider''s public model list; routing remains disabled.', 'checked_at', p_now),
        'external_sync_added', jsonb_build_object('at', p_now, 'matched_by', addition.matched_by))
    from additions addition
    returning provider_model_id, model_slug, output_modalities
  ),
  variants as (
    insert into public.v2_route_variants (provider_model_id, variant_key, service_tier_slug, status, routing_enabled, metadata)
    select provider_model_id, 'global:standard', 'standard', 'active', false, jsonb_build_object('scope', 'global', 'source', 'external_sync')
    from inserted
    returning provider_model_id
  ),
  capabilities as (
    insert into public.v2_route_capabilities (provider_model_id, capability_id, status, metadata)
    select provider_model_id, 'text.generate', 'active', jsonb_build_object('source', 'external_sync')
    from inserted
    where output_modalities = array['text']
    returning provider_model_id
  )
  select count(*), coalesce(jsonb_agg(model_slug order by model_slug) filter (where position <= 25), '[]'::jsonb)
  into v_added, v_added_sample
  from (select model_slug, row_number() over (order by model_slug) as position from inserted) added;

  drop table if exists pg_temp.external_sync_routes;
  create temporary table external_sync_routes on commit drop as
  select route.provider_model_id, route.provider_availability_status, route.context_length, route.max_output_tokens,
    route.metadata, incoming.key as incoming_key, incoming.context_length as new_context_length,
    incoming.max_output_tokens as new_max_output_tokens, incoming.meter_nanos
  from public.v2_model_provider_routes route
  left join external_sync_incoming incoming on incoming.key = lower(route.provider_model_slug)
  where route.provider_slug = p_provider_slug
    and route.routing_enabled = false;

  select count(*), count(incoming_key) into v_route_count, v_seen_count from external_sync_routes;
  -- An empty list, or one that recognises under a quarter of our routes, points at an API or ID
  -- format change rather than a mass removal, so nothing is removed until a person looks.
  -- Routes added in this run are listed by definition, so they do not count towards the match rate.
  v_allow_removals := v_route_count - v_added > 0
    and v_seen_count - v_added >= greatest(1, ceil((v_route_count - v_added) * 0.25));

  -- Listed routes: refresh limits, bring back removed routes, clear any missing marker.
  with changed as (
    update public.v2_model_provider_routes route set
      context_length = coalesce(src.new_context_length, route.context_length),
      max_output_tokens = coalesce(src.new_max_output_tokens, route.max_output_tokens),
      provider_availability_status = case when route.provider_availability_status = 'removed' then 'available' else route.provider_availability_status end,
      metadata = case when route.metadata ? 'external_sync' then route.metadata - 'external_sync' else route.metadata end,
      updated_at = p_now
    from external_sync_routes src
    where route.provider_model_id = src.provider_model_id
      and src.incoming_key is not null
      and (
        (src.new_context_length is not null and src.new_context_length is distinct from route.context_length)
        or (src.new_max_output_tokens is not null and src.new_max_output_tokens is distinct from route.max_output_tokens)
        or route.provider_availability_status = 'removed'
        or route.metadata ? 'external_sync'
      )
    returning src.context_length as old_context, src.max_output_tokens as old_max, route.context_length, route.max_output_tokens,
      src.provider_availability_status as old_status, src.metadata ? 'external_sync' as had_marker
  )
  select
    count(*) filter (where context_length is distinct from old_context or max_output_tokens is distinct from old_max),
    count(*) filter (where old_status = 'removed'),
    count(*) filter (where had_marker)
  into v_limits_updated, v_restored, v_cleared
  from changed;

  -- Unlisted routes: note when they first went missing, and mark them removed after the grace period.
  if v_allow_removals then
    with marked as (
      update public.v2_model_provider_routes route set
        metadata = route.metadata || jsonb_build_object('external_sync', jsonb_build_object('missing_since', p_now)),
        updated_at = p_now
      from external_sync_routes src
      where route.provider_model_id = src.provider_model_id
        and src.incoming_key is null
        and route.provider_availability_status <> 'removed'
        and not (route.metadata ? 'external_sync')
      returning 1
    )
    select count(*) into v_newly_missing from marked;

    with removed as (
      update public.v2_model_provider_routes route set
        provider_availability_status = 'removed',
        updated_at = p_now
      from external_sync_routes src
      where route.provider_model_id = src.provider_model_id
        and src.incoming_key is null
        and route.provider_availability_status <> 'removed'
        and (route.metadata #>> '{external_sync,missing_since}')::timestamptz <= p_now - v_grace
      returning 1
    )
    select count(*) into v_removed from removed;
  end if;

  -- Prices: only routes with one unconditional standard text price (or none yet) are kept in step.
  for r in
    select src.provider_model_id, src.meter_nanos
    from external_sync_routes src
    where src.incoming_key is not null
      and src.meter_nanos ? 'input_text_tokens'
      and src.meter_nanos ? 'output_text_tokens'
  loop
    select count(*) into v_active_count
    from public.v2_pricing_skus sku
    where sku.provider_model_id = r.provider_model_id
      and sku.operation = 'text.generate' and coalesce(sku.service_tier_slug, 'standard') = 'standard' and sku.region is null
      and sku.effective_to is null;

    if v_active_count = 0 then
      if not exists (
        select 1 from public.v2_route_capabilities capability
        where capability.provider_model_id = r.provider_model_id and capability.capability_id = 'text.generate' and capability.status = 'active'
      ) then
        continue;
      end if;
      insert into public.v2_pricing_skus (provider_model_id, sku_code, version, operation, status, region, service_tier_slug,
        display_name, description, currency, effective_from, route_variant_id, metadata)
      values (r.provider_model_id, 'external-sync', coalesce((select max(version) from public.v2_pricing_skus where provider_model_id = r.provider_model_id and sku_code = 'external-sync'), 0) + 1,
        'text.generate', 'active', null, 'standard', 'standard text.generate', 'Synced from the provider''s public model list.', 'USD', p_now,
        (select variant.variant_id from public.v2_route_variants variant where variant.provider_model_id = r.provider_model_id and variant.variant_key = 'global:standard'),
        jsonb_build_object('source', 'external_sync', 'match', '[]'::jsonb, 'time_windows', '[]'::jsonb, 'priority', 100, 'billing_timestamp_basis', 'request_start'))
      returning sku_id into v_new_sku;
      insert into public.v2_pricing_sku_meters (sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit, metadata)
      select v_new_sku, meter.key, 'text', case when meter.key like 'output%' then 'output' else 'input' end, 'token', 1000000,
        (meter.value #>> '{}')::numeric, meter.key, '1000000 token', jsonb_build_object('source', 'external_sync')
      from jsonb_each(r.meter_nanos) meter;
      v_prices_added := v_prices_added + 1;
      continue;
    end if;

    select sku.* into v_sku
    from public.v2_pricing_skus sku
    where sku.provider_model_id = r.provider_model_id
      and sku.operation = 'text.generate' and coalesce(sku.service_tier_slug, 'standard') = 'standard' and sku.region is null
      and sku.effective_to is null
    limit 1;

    if v_active_count > 1 or coalesce(v_sku.metadata->'match', 'null'::jsonb) not in ('null'::jsonb, '[]'::jsonb, '{}'::jsonb)
       or coalesce(v_sku.metadata->'time_windows', 'null'::jsonb) not in ('null'::jsonb, '[]'::jsonb, '{}'::jsonb)
       or exists (
         select 1 from public.v2_pricing_sku_meters meter
         where meter.sku_id = v_sku.sku_id
           and (coalesce(meter.metadata->'match', 'null'::jsonb) not in ('null'::jsonb, '[]'::jsonb, '{}'::jsonb)
             or coalesce(meter.metadata->'time_windows', 'null'::jsonb) not in ('null'::jsonb, '[]'::jsonb, '{}'::jsonb))
       )
       or v_sku.effective_from >= p_now then
      v_prices_skipped := v_prices_skipped + 1;
      continue;
    end if;

    select exists (
      select 1 from jsonb_each(r.meter_nanos) incoming
      left join public.v2_pricing_sku_meters existing on existing.sku_id = v_sku.sku_id and existing.meter_key = incoming.key
      where existing.sku_meter_id is null
        or round(existing.price_nanos / existing.unit_quantity * 1000000) <> (incoming.value #>> '{}')::numeric
    ) into v_changed;
    if not v_changed then
      continue;
    end if;

    update public.v2_pricing_skus set effective_to = p_now, updated_at = p_now where sku_id = v_sku.sku_id;
    insert into public.v2_pricing_skus (provider_model_id, sku_code, version, operation, status, region, service_tier_slug,
      display_name, description, currency, effective_from, route_variant_id, metadata)
    values (v_sku.provider_model_id, v_sku.sku_code,
      (select max(version) from public.v2_pricing_skus where provider_model_id = v_sku.provider_model_id and sku_code = v_sku.sku_code) + 1,
      v_sku.operation, v_sku.status, v_sku.region, v_sku.service_tier_slug, v_sku.display_name, v_sku.description, v_sku.currency, p_now,
      v_sku.route_variant_id, v_sku.metadata || jsonb_build_object('source', 'external_sync'))
    returning sku_id into v_new_sku;
    -- Carry every meter over; core meters the provider listed take its new rate.
    insert into public.v2_pricing_sku_meters (sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit, billable, meter_order, metadata)
    select v_new_sku, existing.meter_key, existing.modality, existing.direction, existing.unit, existing.unit_quantity,
      coalesce((r.meter_nanos ->> existing.meter_key)::numeric / 1000000 * existing.unit_quantity, existing.price_nanos),
      existing.display_label, existing.display_unit, existing.billable, existing.meter_order, existing.metadata
    from public.v2_pricing_sku_meters existing
    where existing.sku_id = v_sku.sku_id;
    insert into public.v2_pricing_sku_meters (sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit, metadata)
    select v_new_sku, meter.key, 'text', case when meter.key like 'output%' then 'output' else 'input' end, 'token', 1000000,
      (meter.value #>> '{}')::numeric, meter.key, '1000000 token', jsonb_build_object('source', 'external_sync')
    from jsonb_each(r.meter_nanos) meter
    where not exists (select 1 from public.v2_pricing_sku_meters existing where existing.sku_id = v_sku.sku_id and existing.meter_key = meter.key);
    v_prices_changed := v_prices_changed + 1;
  end loop;

  select count(*), coalesce(jsonb_agg(id order by id) filter (where position <= 25), '[]'::jsonb)
  into v_unmatched_count, v_unmatched
  from (
    select incoming.id, row_number() over (order by incoming.id) as position
    from external_sync_incoming incoming
    where not exists (
      select 1 from public.v2_model_provider_routes route
      where route.provider_slug = p_provider_slug and lower(route.provider_model_slug) = incoming.key
    )
  ) unmatched;

  return jsonb_build_object(
    'provider', p_provider_slug,
    'listed', (select count(*) from external_sync_incoming),
    'routes', v_route_count,
    'matched', v_seen_count,
    'added', v_added,
    'added_sample', v_added_sample,
    'limits_updated', v_limits_updated,
    'restored', v_restored,
    'missing_cleared', v_cleared,
    'newly_missing', v_newly_missing,
    'removed', v_removed,
    'removals_skipped', not v_allow_removals,
    'prices_changed', v_prices_changed,
    'prices_added', v_prices_added,
    'prices_skipped_conditional', v_prices_skipped,
    'unmatched', v_unmatched_count,
    'unmatched_sample', v_unmatched
  );
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."sync_external_provider_catalogue"(text, jsonb, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_external_provider_catalogue"(text, jsonb, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_external_provider_catalogue"(text, jsonb, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_external_provider_catalogue"(text, jsonb, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
