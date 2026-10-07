CREATE OR REPLACE FUNCTION public.enqueue_gateway_routing_archive_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  -- Queue even when no reference exists yet: an upload may be in flight when
  -- retention deletes the source. The prefix includes all immutable revisions.
  insert into public.gateway_routing_archive_deletions(object_prefix) values(
    'workspaces/' || old.workspace_id::text || '/routing/v1/' ||
    encode(sha256(convert_to(old.request_id, 'UTF8')), 'hex') || '/'
  ) on conflict (object_prefix) do nothing;
  return old;
end;
$function$;
REVOKE ALL ON FUNCTION public.enqueue_gateway_routing_archive_deletion() FROM PUBLIC, anon, authenticated;
