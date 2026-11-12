CREATE OR REPLACE FUNCTION private.capture_gateway_workspace_publication()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  old_row jsonb;
  new_row jsonb;
  target uuid;
begin
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;
  -- Advisory BYOK usage updates must never create publication traffic.
  if tg_op = 'UPDATE' and
    (old_row - array['updated_at','last_used_at']) is not distinct from
    (new_row - array['updated_at','last_used_at']) then return null; end if;
  for target in
    select distinct id from (
      select case
        when tg_table_name = 'workspaces' then (r->>'id')::uuid
        when tg_table_name = 'key_guardrails' then
          (select g.workspace_id from public.workspace_guardrails g where g.id = (r->>'guardrail_id')::uuid)
        when tg_table_name = 'gateway_dynamic_route_keys' then
          (select d.workspace_id from public.gateway_dynamic_routes d where d.id = (r->>'route_id')::uuid)
        else (r->>'workspace_id')::uuid end as id
      from (values(old_row),(new_row)) rows(r) where r is not null
    ) targets where id is not null order by id
  loop
    perform private.enqueue_gateway_workspace_publication(target);
  end loop;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."capture_gateway_workspace_publication"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."capture_gateway_workspace_publication"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."capture_gateway_workspace_publication"() TO "postgres";
