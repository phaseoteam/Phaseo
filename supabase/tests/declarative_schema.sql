begin;
do $$
declare routing_table text;
begin
  assert public.canonical_routing_capability_id('audio.transcribe') = 'audio.transcription', 'production capability mapping missing';
  assert public.canonical_routing_capability_id('unsupported.operation') is null, 'unknown capability accepted';
  assert public.canonical_routing_capability_id('audio') is null, 'retired generic audio capability accepted';
  assert public.canonical_routing_capability_id('chat/completions') = 'text.generate', 'slash endpoint alias missing';
  assert public.canonical_routing_capability_id('document.parse') = 'parse', 'document endpoint alias missing';
  assert exists (select 1 from pg_trigger where tgrelid = 'public.v2_pricing_skus'::regclass and tgname = 'canonical_pricing_operation'), 'pricing operation trigger missing';
  assert not has_function_privilege('anon', 'public.normalize_routing_pricing_operation()', 'EXECUTE'), 'anon can execute pricing trigger function';
  foreach routing_table in array array['v2_route_capabilities', 'v2_capability_adapters', 'v2_capability_constraints', 'v2_capability_evidence', 'v2_capability_parameters', 'v2_execution_plans', 'v2_provider_capability_adapters', 'v2_provider_endpoints', 'v2_route_parameter_support'] loop
    assert exists (select 1 from pg_trigger where tgrelid = to_regclass('public.' || routing_table) and tgname = 'canonical_routing_capability'), 'production capability trigger missing';
    assert exists (select 1 from pg_constraint where conrelid = to_regclass('public.' || routing_table) and conname = 'canonical_capability_id'), 'production capability constraint missing';
  end loop;
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
