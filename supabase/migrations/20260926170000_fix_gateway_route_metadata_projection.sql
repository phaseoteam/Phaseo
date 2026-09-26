-- The external route override migration added m.metadata checks to the
-- gateway context function without exposing metadata from its route subqueries.
-- Project that column so every inference request can build its context.
do $migration$
declare
  definition text;
  patched text;
  old_projection text := 'updated_at from public.v2_model_provider_routes';
  new_projection text := 'updated_at, metadata from public.v2_model_provider_routes';
begin
  select pg_get_functiondef(
    'public.gateway_fetch_request_context_without_workspace_budget(uuid,text,text,uuid)'::regprocedure
  ) into definition;

  if (length(definition) - length(replace(definition, old_projection, '')))
       / length(old_projection) <> 2 then
    raise exception 'Unexpected gateway route metadata projection count';
  end if;

  patched := replace(definition, old_projection, new_projection);
  execute patched;
end
$migration$;

notify pgrst, 'reload schema';
