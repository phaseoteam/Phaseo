CREATE OR REPLACE FUNCTION private.enqueue_provider_health_for_fact()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare provider_value text;
begin
  if tg_op = 'UPDATE' and old.occurred_at::date is not distinct from new.occurred_at::date
    and coalesce(old.routed_model_slug, old.requested_model_slug) is not distinct from
        coalesce(new.routed_model_slug, new.requested_model_slug) then
    return new;
  end if;
  for provider_value in select distinct provider_model_id from public.v2_request_attempts
    where request_event_id = old.request_event_id and provider_model_id is not null
    order by provider_model_id
  loop
    perform private.enqueue_provider_health_refresh(old.occurred_at::date,
      coalesce(old.routed_model_slug, old.requested_model_slug), provider_value);
    if tg_op = 'UPDATE' then
      perform private.enqueue_provider_health_refresh(new.occurred_at::date,
        coalesce(new.routed_model_slug, new.requested_model_slug), provider_value);
    end if;
  end loop;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."enqueue_provider_health_for_fact"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_provider_health_for_fact"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enqueue_provider_health_for_fact"() TO "postgres";
