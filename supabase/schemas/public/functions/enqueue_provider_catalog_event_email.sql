CREATE OR REPLACE FUNCTION public.enqueue_provider_catalog_event_email()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  if new.workspace_id is null then return new; end if;
  insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload)
  select
    new.event_type, 'generic', u.email, new.title, new.workspace_id, u.user_id,
    jsonb_build_object('message', new.message, 'provider_slug', new.provider_slug, 'run_id', new.run_id)
  from public.workspace_members wm
  join public.users u on u.user_id = wm.user_id
  where wm.workspace_id = new.workspace_id and nullif(trim(u.email), '') is not null;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enqueue_provider_catalog_event_email"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enqueue_provider_catalog_event_email"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enqueue_provider_catalog_event_email"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enqueue_provider_catalog_event_email"() FROM PUBLIC, "anon", "authenticated";
