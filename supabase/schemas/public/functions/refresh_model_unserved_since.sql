CREATE OR REPLACE FUNCTION public.refresh_model_unserved_since ()
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_now timestamptz := now(); v_marked integer; v_cleared integer; v_approved integer := 0;
  v_slug text; v_before jsonb; v_after jsonb; v_compatibility jsonb;
begin
  -- Stamps when a model stopped being served and clears the stamp when a route
  -- comes back. Models that never had a route are not tracked. Rows are only
  -- written on a change, so an hourly run is cheap.
  with unserved as (
    select m.model_slug
    from public.v2_models m
    where not m.hidden
      and m.status in ('active','deprecated','retired')
      and exists (select 1 from public.v2_model_provider_routes r where r.model_slug=m.model_slug)
      and not public.v2_model_has_routable_route(m.model_slug, v_now)
  ), marked as (
    insert into public.v2_model_successor_routing as s (model_slug, unserved_since)
    select model_slug, v_now from unserved
    on conflict (model_slug) do update set unserved_since=v_now, updated_at=v_now
      where s.unserved_since is null
    returning 1
  ), cleared as (
    update public.v2_model_successor_routing s set unserved_since=null, updated_at=v_now
    where s.unserved_since is not null
      and not exists (select 1 from unserved u where u.model_slug=s.model_slug)
    returning 1
  )
  select (select count(*) from marked), (select count(*) from cleared) into v_marked, v_cleared;

  -- Approves the suggested replacement of a deprecated or retired model when
  -- it has no compatibility issues at all, so setting a replacement is enough.
  -- Replacements with warnings still need an admin; models an admin revoked
  -- are left alone. Only models without a current approval are checked.
  for v_slug in
    select m.model_slug
    from public.v2_models m
    left join public.v2_model_successor_routing s on s.model_slug=m.model_slug
    where not m.hidden
      and m.replacement_model_slug is not null
      and (m.status in ('deprecated','retired') or m.deprecated_at is not null or m.retired_at is not null)
      and not coalesce(s.auto_approval_blocked, false)
      and not (coalesce(s.auto_route_enabled, false) and s.approved_successor_slug is not distinct from m.replacement_model_slug)
    order by m.model_slug
  loop
    -- Take the same model lock as set_model_successor_routing, then re-read
    -- the state, so an admin revoking at the same moment always wins. A model
    -- being edited right now is left for the next run.
    perform 1 from public.v2_models where model_slug=v_slug for update skip locked;
    continue when not found;
    continue when exists (select 1 from public.v2_model_successor_routing s join public.v2_models m on m.model_slug=s.model_slug
      where s.model_slug=v_slug and (s.auto_approval_blocked
        or (s.auto_route_enabled and s.approved_successor_slug is not distinct from m.replacement_model_slug)));
    v_before := public.get_model_successor_routing(v_slug);
    v_compatibility := v_before->'compatibility';
    continue when v_compatibility is null or jsonb_typeof(v_compatibility) <> 'object'
      or jsonb_array_length(v_compatibility->'blocking') > 0 or jsonb_array_length(v_compatibility->'warnings') > 0;

    insert into public.v2_model_successor_routing as s (model_slug, auto_route_enabled, approved_successor_slug, approved_by, approved_at, compatibility, approval_source)
    values (v_slug, true, v_compatibility->>'successor', null, v_now, v_compatibility || jsonb_build_object('accepted_warnings', false), 'auto')
    on conflict (model_slug) do update set auto_route_enabled=true, approved_successor_slug=excluded.approved_successor_slug,
      approved_by=null, approved_at=v_now, compatibility=excluded.compatibility, approval_source='auto', updated_at=v_now
      where not s.auto_approval_blocked;
    continue when not found;

    v_after := public.get_model_successor_routing(v_slug);
    insert into public.v2_catalogue_admin_changes (actor_user_id, resource_type, resource_id, action, before_state, after_state)
    values (null, 'models', v_slug, 'update',
      jsonb_build_object('successor_routing', v_before), jsonb_build_object('successor_routing', v_after));
    v_approved := v_approved + 1;
  end loop;

  return jsonb_build_object('marked', v_marked, 'cleared', v_cleared, 'auto_approved', v_approved, 'checked_at', v_now);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_model_unserved_since"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_model_unserved_since"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_model_unserved_since"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_model_unserved_since"() FROM PUBLIC, "anon", "authenticated";
