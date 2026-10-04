CREATE OR REPLACE FUNCTION public.merge_v2_gateway_app_history (
  p_workspace_id  uuid,
  p_source_app_id uuid,
  p_target_app_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_app_count integer;
  v_gateway_requests integer := 0;
  v_request_facts integer := 0;
  v_since timestamptz;
  v_until timestamptz;
begin
  if p_workspace_id is null or p_source_app_id is null or p_target_app_id is null
     or p_source_app_id = p_target_app_id then
    raise exception using errcode = '22023', message = 'invalid_app_merge';
  end if;

  select count(*)::integer into v_app_count
  from public.api_apps app
  where app.workspace_id = p_workspace_id
    and app.id in (p_source_app_id, p_target_app_id);
  if v_app_count <> 2 then
    raise exception using errcode = '23503', message = 'app_merge_target_not_found';
  end if;

  select min(fact.occurred_at), max(fact.occurred_at)
  into v_since, v_until
  from public.v2_request_facts fact
  where fact.workspace_id = p_workspace_id
    and fact.app_id = p_source_app_id;

  update public.gateway_requests request
  set app_id = p_target_app_id
  where request.workspace_id = p_workspace_id
    and request.app_id = p_source_app_id;
  get diagnostics v_gateway_requests = row_count;

  update public.v2_request_facts fact
  set app_id = p_target_app_id
  where fact.workspace_id = p_workspace_id
    and fact.app_id = p_source_app_id;
  get diagnostics v_request_facts = row_count;

  -- Remove the source grains before deleting the app. Otherwise their foreign
  -- keys become null and retain stale traffic under an unattributed bucket.
  delete from public.v2_private_usage_daily rollup
  where rollup.workspace_id = p_workspace_id
    and rollup.app_id = p_source_app_id;
  delete from public.v2_public_usage_daily rollup
  where rollup.app_id = p_source_app_id;
  delete from public.v2_public_usage_hourly rollup
  where rollup.app_id = p_source_app_id;

  if v_since is not null then
    perform public.refresh_v2_analytics_range(
      v_since,
      v_until + interval '1 microsecond',
      p_workspace_id
    );
  end if;

  delete from public.api_apps app
  where app.workspace_id = p_workspace_id
    and app.id = p_source_app_id;

  return jsonb_build_object(
    'gateway_requests', v_gateway_requests,
    'request_facts', v_request_facts
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."merge_v2_gateway_app_history"(uuid, uuid, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."merge_v2_gateway_app_history"(uuid, uuid, uuid) IS 'Atomically moves authoritative request history and V2 analytics to a target app, rebuilds affected grains, and deletes the source app.';

REVOKE ALL ON FUNCTION "public"."merge_v2_gateway_app_history"(uuid, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."merge_v2_gateway_app_history"(uuid, uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."merge_v2_gateway_app_history"(uuid, uuid, uuid) FROM PUBLIC, "anon", "authenticated";
