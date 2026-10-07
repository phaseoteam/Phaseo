CREATE OR REPLACE FUNCTION public.enqueue_gateway_routing_archive_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_key text := old.detail_metadata#>>'{routing_archive,key}';
begin
  if starts_with(v_key, 'workspaces/' || old.workspace_id::text || '/routing/v1/') then
    insert into public.gateway_routing_archive_deletions(object_key) values(v_key)
    on conflict (object_key) do nothing;
  end if;
  return old;
end;
$function$;
REVOKE ALL ON FUNCTION public.enqueue_gateway_routing_archive_deletion() FROM PUBLIC, anon, authenticated;
