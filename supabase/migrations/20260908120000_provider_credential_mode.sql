alter table public.v2_providers
  add column if not exists credential_mode text not null default 'managed_and_byok';

alter table public.v2_providers
  drop constraint if exists v2_providers_credential_mode_check;

alter table public.v2_providers
  add constraint v2_providers_credential_mode_check
  check (credential_mode in ('managed_and_byok', 'byok_only'));

comment on column public.v2_providers.credential_mode is
  'Whether Phaseo may use managed provider credentials or must use a workspace BYOK credential.';

alter table public.v2_model_provider_routes
  add column if not exists credential_mode text not null default 'managed_and_byok'
  check (credential_mode in ('managed_and_byok', 'byok_only'));

comment on column public.v2_model_provider_routes.credential_mode is
  'Optional route-level override requiring a workspace BYOK credential for this model offer.';

-- Carry credential mode through the existing repository-backed admin editor.
do $$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef('public.mutate_v2_admin_catalogue(uuid,text,text,text,jsonb)'::regprocedure)
    into v_definition;
  v_original := v_definition;
  v_definition := replace(
    v_definition,
    'insert into public.v2_providers(provider_slug,name,status,country_code,subdivision_code,base_url,default_execution_regions,byok_available,metadata,updated_at)',
    'insert into public.v2_providers(provider_slug,name,status,country_code,subdivision_code,base_url,default_execution_regions,byok_available,credential_mode,metadata,updated_at)'
  );
  v_definition := replace(
    v_definition,
    $old$case when jsonb_typeof(p_payload->'default_execution_regions') = 'array' then array(select jsonb_array_elements_text(p_payload->'default_execution_regions')) else null end,coalesce((p_payload->>'byok_available')::boolean,false),jsonb_strip_nulls$old$,
    $new$case when jsonb_typeof(p_payload->'default_execution_regions') = 'array' then array(select jsonb_array_elements_text(p_payload->'default_execution_regions')) else null end,coalesce((p_payload->>'byok_available')::boolean,false),coalesce(nullif(p_payload->>'credential_mode',''),'managed_and_byok'),jsonb_strip_nulls$new$
  );
  v_definition := replace(
    v_definition,
    'byok_available=case when p_payload ? ''byok_available'' then excluded.byok_available else public.v2_providers.byok_available end,metadata=',
    'byok_available=case when p_payload ? ''byok_available'' then excluded.byok_available else public.v2_providers.byok_available end,credential_mode=case when p_payload ? ''credential_mode'' then excluded.credential_mode else public.v2_providers.credential_mode end,metadata='
  );
  if v_definition = v_original or position('credential_mode' in v_definition) = 0 then
    raise exception 'admin catalogue mutation function did not contain the expected provider clauses';
  end if;
  execute v_definition;
end $$;

notify pgrst, 'reload schema';

create or replace function public.increment_workspace_byok_monthly_request_count_by(
  p_workspace_id uuid,
  p_now timestamptz,
  p_request_count bigint
)
returns table (month_start timestamptz, request_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month_start timestamptz;
begin
  if p_workspace_id is null then raise exception 'p_workspace_id is required'; end if;
  if p_request_count is null or p_request_count < 1 then raise exception 'p_request_count must be positive'; end if;
  v_month_start := (date_trunc('month', p_now at time zone 'UTC') at time zone 'UTC');
  insert into public.workspace_byok_monthly_usage as usage (
    workspace_id, month_start, request_count, created_at, updated_at
  ) values (
    p_workspace_id, v_month_start, p_request_count, now(), now()
  ) on conflict (workspace_id, month_start) do update
    set request_count = usage.request_count + excluded.request_count,
        updated_at = now();
  return query select u.month_start, u.request_count
    from public.workspace_byok_monthly_usage u
    where u.workspace_id = p_workspace_id and u.month_start = v_month_start;
end;
$$;

revoke all on function public.increment_workspace_byok_monthly_request_count_by(uuid,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.increment_workspace_byok_monthly_request_count_by(uuid,timestamptz,bigint) to service_role;
