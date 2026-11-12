SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.enqueue_provider_catalog_event_email()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.workspace_id is null then return new; end if;
  insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload)
  select
    new.event_type, 'generic', a.email, new.title, new.workspace_id, u.user_id,
    jsonb_build_object('message', new.message, 'provider_slug', new.provider_slug, 'run_id', new.run_id)
  from public.workspace_members wm
  join public.users u on u.user_id = wm.user_id
  join auth.users a on a.id = u.user_id
  where wm.workspace_id = new.workspace_id and nullif(trim(a.email), '') is not null;
  return new;
end;
$function$;
