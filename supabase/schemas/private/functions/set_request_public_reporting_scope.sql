CREATE OR REPLACE FUNCTION private.set_request_public_reporting_scope()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.public_reporting_allowed := new.provider_model_id is not null
    and public.public_reporting_route_is_visible(
      coalesce(new.routed_model_slug, new.requested_model_slug), new.provider_model_id, null, new.occurred_at
    )
    and coalesce(new.safe_metadata->>'testing_mode', 'false') <> 'true';
  if tg_op = 'UPDATE' then
    new.public_reporting_allowed := old.public_reporting_allowed and new.public_reporting_allowed;
  end if;
  return new;
end;
$function$;
revoke all on function private.set_request_public_reporting_scope() from public, anon, authenticated;
