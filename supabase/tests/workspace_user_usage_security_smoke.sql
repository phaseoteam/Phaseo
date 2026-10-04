begin;
do $$
declare payload jsonb;
begin
  if has_function_privilege('anon', 'public.get_workspace_user_usage(uuid,uuid,timestamptz,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.get_workspace_user_usage(uuid,uuid,timestamptz,timestamptz)', 'execute') then
    raise exception 'workspace user analytics must be server-only';
  end if;
  if not has_function_privilege('service_role', 'public.get_workspace_user_usage(uuid,uuid,timestamptz,timestamptz)', 'execute') then
    raise exception 'service role requires aggregate access';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.get_workspace_user_usage(uuid,uuid,timestamptz,timestamptz)'::regprocedure) then
    raise exception 'aggregate must not elevate privileges';
  end if;
  begin
    perform public.get_workspace_user_usage('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', now() - interval '32 days', now());
    raise exception 'unbounded window was accepted';
  exception when invalid_parameter_value then null;
  end;
  payload := public.get_workspace_user_usage('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', now() - interval '30 days', now());
  if payload->>'requests' <> '0' or payload->>'spendUsd' <> '0' or payload->'models' <> '[]'::jsonb or payload->'points' <> '[]'::jsonb then
    raise exception 'empty scope must return zero usage without unrelated data';
  end if;
end $$;
rollback;
