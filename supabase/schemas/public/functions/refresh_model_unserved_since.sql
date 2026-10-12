CREATE OR REPLACE FUNCTION public.refresh_model_unserved_since ()
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_now timestamptz := now(); v_marked integer; v_cleared integer;
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
  return jsonb_build_object('marked', v_marked, 'cleared', v_cleared, 'checked_at', v_now);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_model_unserved_since"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_model_unserved_since"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_model_unserved_since"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_model_unserved_since"() FROM PUBLIC, "anon", "authenticated";
