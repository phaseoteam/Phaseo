begin;
do $$
begin
  assert to_regclass('public.users') is not null, 'users missing from replay';
  assert to_regclass('public.workspaces') is not null, 'workspaces missing from replay';
  assert to_regclass('private.public_reporting_refresh_queue') is not null, 'private schema missing';
  assert (select relrowsecurity from pg_class where oid = 'public.wallets'::regclass), 'wallet RLS disabled';
  assert not has_column_privilege('authenticated', 'public.wallets', 'balance_nanos', 'UPDATE'), 'client can update wallet balance';
  assert not has_column_privilege('authenticated', 'public.wallets', 'reserved_nanos', 'UPDATE'), 'client can update wallet reservations';
  assert exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created_enqueue_welcome'), 'signup trigger missing';
  assert position('https://phaseo.app/chat' in pg_get_functiondef('public.gateway_requests_attach_chat_app_id()'::regprocedure)) > 0, 'chat URL not canonical';
  assert not has_function_privilege('anon', 'public.gateway_requests_attach_chat_app_id()', 'EXECUTE'), 'anon can execute privileged trigger function';
  assert not has_function_privilege('authenticated', 'public.gateway_requests_attach_chat_app_id()', 'EXECUTE'), 'client can execute privileged trigger function';
end $$;
rollback;
