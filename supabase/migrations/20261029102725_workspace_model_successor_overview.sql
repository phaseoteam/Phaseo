-- Lists what retired model routing does for a workspace's models, for the
-- Retired model routing settings section. Read-only; service role only.

CREATE OR REPLACE FUNCTION public.get_workspace_model_successor_overview (
  p_workspace_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_rows jsonb := '[]'::jsonb; r record; v_resolution jsonb; v_replacement text; v_price jsonb;
begin
  -- What retired model routing does for this workspace's models: those it
  -- asked for in the last 90 days that are deprecated, retired or no longer
  -- served, and those it set its own replacement for. Each row uses the
  -- gateway's own resolvers, so it matches what a request would get today.
  -- Keyed on the requested model, so requests already redirected still count.
  for r in
    with lifecycle as (
      select m.model_slug
      from public.v2_models m
      left join public.v2_model_successor_routing s on s.model_slug=m.model_slug
      where not m.hidden
        and (m.status in ('deprecated','retired') or m.retired_at is not null or s.unserved_since is not null)
    ), used as (
      select f.requested_model_slug as model_slug, max(f.occurred_at) as last_used_at, count(*) as requests
      from public.v2_request_facts f
      where f.workspace_id=p_workspace_id
        and f.occurred_at >= now() - interval '90 days'
        and f.requested_model_slug in (select model_slug from lifecycle)
      group by f.requested_model_slug
    ), overrides as (
      select o.model_slug, o.successor_model_slug
      from public.workspace_model_successor_overrides o
      where o.workspace_id=p_workspace_id
    ), candidates as (
      select coalesce(u.model_slug, o.model_slug) as model_slug, u.last_used_at, coalesce(u.requests, 0) as requests,
        o.model_slug is not null as has_override, o.successor_model_slug as override_successor
      from used u
      full join overrides o on o.model_slug=u.model_slug
    )
    select c.*, m.name, m.status, m.deprecated_at, m.retired_at, m.replacement_model_slug,
      s.unserved_since,
      coalesce(s.auto_route_enabled and s.approved_successor_slug is not distinct from m.replacement_model_slug, false) as approved
    from candidates c
    join public.v2_models m on m.model_slug=c.model_slug and not m.hidden
    left join public.v2_model_successor_routing s on s.model_slug=c.model_slug
    order by c.last_used_at desc nulls last, c.model_slug
    limit 200
  loop
    v_price := null;
    if r.has_override and r.override_successor is null then
      v_resolution := jsonb_build_object('reason', 'never', 'target', null);
      v_replacement := null;
    elsif r.has_override then
      v_resolution := public.gateway_resolve_workspace_model_successor(r.model_slug, r.override_successor);
      v_replacement := r.override_successor;
    else
      v_resolution := public.gateway_resolve_model_successor(r.model_slug);
      v_replacement := case when r.approved then r.replacement_model_slug end;
    end if;
    v_replacement := coalesce(v_resolution->>'target', v_replacement);
    -- Before the model stops being served there is no target yet, so price the
    -- replacement it would get.
    if v_resolution->>'target' is null and v_replacement is not null then
      v_price := public.v2_model_successor_price_ratio(r.model_slug, v_replacement);
    end if;

    v_rows := v_rows || jsonb_build_object(
      'model', r.model_slug,
      'name', r.name,
      'status', r.status,
      'deprecated_at', r.deprecated_at,
      'retired_at', r.retired_at,
      'unserved_since', r.unserved_since,
      'last_used_at', r.last_used_at,
      'requests', r.requests,
      'suggested_replacement', r.replacement_model_slug,
      'approved', r.approved,
      'workspace_override', r.has_override,
      'replacement', v_replacement,
      'replacement_name', (select name from public.v2_models where model_slug=v_replacement),
      'target', v_resolution->>'target',
      'reason', v_resolution->>'reason',
      'price_ratio', coalesce((v_price->>'ratio')::numeric, (v_resolution->>'price_ratio')::numeric),
      'price_comparable', coalesce((v_price->>'comparable')::boolean, (v_resolution->>'price_comparable')::boolean, false),
      'price_skipped_meters', coalesce(v_price->'skipped_meters', v_resolution->'price_skipped_meters', '[]'::jsonb),
      -- Requests for this model another model answered in the last 30 days.
      'served_by', coalesce((
        select jsonb_agg(jsonb_build_object('model', x.routed_model_slug, 'requests', x.requests, 'last_at', x.last_at) order by x.requests desc)
        from (
          select f.routed_model_slug, count(*) as requests, max(f.occurred_at) as last_at
          from public.v2_request_facts f
          where f.workspace_id=p_workspace_id
            and f.requested_model_slug=r.model_slug
            and f.occurred_at >= now() - interval '30 days'
            and f.success
            and f.routed_model_slug is not null
            and f.routed_model_slug<>r.model_slug
          group by f.routed_model_slug
        ) x
      ), '[]'::jsonb));
  end loop;
  return v_rows;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."get_workspace_model_successor_overview"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_workspace_model_successor_overview"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_model_successor_overview"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_workspace_model_successor_overview"(uuid) FROM PUBLIC, "anon", "authenticated";
