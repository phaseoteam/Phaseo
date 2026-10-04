CREATE OR REPLACE FUNCTION public.attach_v2_request_fact_to_gateway_request()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.gateway_request_id is null or new.gateway_request_created_at is null then
    select request.id, request.created_at
    into new.gateway_request_id, new.gateway_request_created_at
    from public.gateway_requests request
    where request.workspace_id = new.workspace_id
      and request.request_id = new.request_id
    order by
      case when request.created_at = new.occurred_at then 0 else 1 end,
      abs(extract(epoch from (request.created_at - new.occurred_at))),
      request.created_at desc
    limit 1;
  end if;

  if new.gateway_request_id is null or new.gateway_request_created_at is null then
    raise exception using
      errcode = '23503',
      message = 'v2_request_fact_requires_gateway_request';
  end if;

  update public.gateway_requests request
  set detail_metadata = coalesce(request.detail_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'client_source', new.safe_metadata->'client_source',
      'request', coalesce(request.detail_metadata->'request', '{}'::jsonb)
        || jsonb_build_object('user_agent', new.user_agent)
    )
  where request.id = new.gateway_request_id
    and request.created_at = new.gateway_request_created_at;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."attach_v2_request_fact_to_gateway_request"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."attach_v2_request_fact_to_gateway_request"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."attach_v2_request_fact_to_gateway_request"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."attach_v2_request_fact_to_gateway_request"() FROM PUBLIC, "anon", "authenticated";
