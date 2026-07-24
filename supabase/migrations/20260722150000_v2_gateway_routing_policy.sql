-- Gateway v2 routing policy and ordered BYOK credentials.
--
-- Catalogue and data-plane policy belongs to the additive v2 namespace. BYOK
-- remains a workspace configuration table, so it is extended in place rather
-- than copied into a second source of truth.

drop index if exists public.byok_keys_team_provider_unique;
drop index if exists public.byok_keys_workspace_provider_unique;

alter table public.byok_keys
  add column if not exists routing_mode text,
  add column if not exists sort_order integer;

update public.byok_keys
set routing_mode = case when coalesce(always_use, false) then 'priority' else 'fallback' end
where routing_mode is null;

with ordered as (
  select id,
    row_number() over (
      partition by workspace_id, provider_id, routing_mode
      order by created_at, id
    ) - 1 as desired_sort_order
  from public.byok_keys
)
update public.byok_keys key
set sort_order = ordered.desired_sort_order
from ordered
where key.id = ordered.id and key.sort_order is null;

alter table public.byok_keys
  alter column routing_mode set default 'fallback',
  alter column routing_mode set not null,
  alter column sort_order set default 0,
  alter column sort_order set not null;

alter table public.byok_keys
  drop constraint if exists byok_keys_routing_mode_check;
alter table public.byok_keys
  add constraint byok_keys_routing_mode_check
  check (routing_mode in ('priority', 'fallback'));

create index if not exists byok_keys_gateway_lookup_idx
  on public.byok_keys (workspace_id, provider_id, routing_mode, sort_order, created_at)
  where enabled = true;

create or replace function public.reorder_v2_byok_key(
  p_workspace_id uuid,
  p_key_id uuid,
  p_direction text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_key public.byok_keys%rowtype;
  adjacent_key public.byok_keys%rowtype;
begin
  if p_direction not in ('up', 'down') then
    raise exception using errcode = '22023', message = 'invalid_direction';
  end if;
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  select * into current_key
  from public.byok_keys
  where id = p_key_id and workspace_id = p_workspace_id
  for update;
  if not found then return false; end if;

  if p_direction = 'up' then
    select * into adjacent_key
    from public.byok_keys
    where workspace_id = current_key.workspace_id
      and provider_id = current_key.provider_id
      and routing_mode = current_key.routing_mode
      and (sort_order, created_at, id) < (current_key.sort_order, current_key.created_at, current_key.id)
    order by sort_order desc, created_at desc, id desc
    limit 1
    for update;
  else
    select * into adjacent_key
    from public.byok_keys
    where workspace_id = current_key.workspace_id
      and provider_id = current_key.provider_id
      and routing_mode = current_key.routing_mode
      and (sort_order, created_at, id) > (current_key.sort_order, current_key.created_at, current_key.id)
    order by sort_order, created_at, id
    limit 1
    for update;
  end if;
  if not found then return true; end if;

  update public.byok_keys
  set sort_order = case
    when id = current_key.id then adjacent_key.sort_order
    else current_key.sort_order
  end
  where id in (current_key.id, adjacent_key.id);
  return true;
end;
$$;

revoke all on function public.reorder_v2_byok_key(uuid, uuid, text) from public;
grant execute on function public.reorder_v2_byok_key(uuid, uuid, text) to authenticated, service_role;

alter table public.v2_providers
  add column if not exists provider_family_slug text,
  add column if not exists offer_scope text,
  add column if not exists offer_label text,
  add column if not exists residency_mode text,
  add column if not exists default_execution_regions text[],
  add column if not exists default_data_regions text[],
  add column if not exists zero_data_retention text,
  add column if not exists prompt_training_policy text,
  add column if not exists data_policy_tier text,
  add column if not exists data_policy_confidence text,
  add column if not exists data_policy_contract_mode text,
  add column if not exists data_policy_variant text;

update public.v2_providers provider
set
  provider_family_slug = legacy.provider_family_id,
  offer_scope = legacy.offer_scope,
  offer_label = legacy.offer_label,
  residency_mode = legacy.residency_mode,
  default_execution_regions = legacy.default_execution_regions,
  default_data_regions = legacy.default_data_regions,
  zero_data_retention = legacy.zero_data_retention,
  prompt_training_policy = legacy.prompt_training_policy,
  data_policy_tier = legacy.data_policy_tier,
  data_policy_confidence = legacy.data_policy_confidence,
  data_policy_contract_mode = legacy.data_policy_contract_mode,
  data_policy_variant = 'standard'
from public.data_api_providers legacy
where legacy.api_provider_id = provider.provider_slug;

update public.v2_providers
set
  offer_scope = coalesce(offer_scope, 'global'),
  residency_mode = coalesce(residency_mode, 'unknown'),
  zero_data_retention = coalesce(zero_data_retention, 'unknown'),
  prompt_training_policy = coalesce(prompt_training_policy, 'unknown'),
  data_policy_tier = coalesce(data_policy_tier, 'unknown'),
  data_policy_confidence = coalesce(data_policy_confidence, 'unknown'),
  data_policy_contract_mode = coalesce(data_policy_contract_mode, 'none'),
  data_policy_variant = case
    when lower(coalesce(data_policy_variant, '')) = 'zdr' then 'zdr'
    else 'standard'
  end;

alter table public.v2_providers
  alter column offer_scope set default 'global',
  alter column offer_scope set not null,
  alter column residency_mode set default 'unknown',
  alter column residency_mode set not null,
  alter column zero_data_retention set default 'unknown',
  alter column zero_data_retention set not null,
  alter column prompt_training_policy set default 'unknown',
  alter column prompt_training_policy set not null,
  alter column data_policy_tier set default 'unknown',
  alter column data_policy_tier set not null,
  alter column data_policy_confidence set default 'unknown',
  alter column data_policy_confidence set not null,
  alter column data_policy_contract_mode set default 'none',
  alter column data_policy_contract_mode set not null,
  alter column data_policy_variant set default 'standard',
  alter column data_policy_variant set not null;

alter table public.v2_providers
  drop constraint if exists v2_providers_offer_scope_check,
  drop constraint if exists v2_providers_residency_mode_check,
  drop constraint if exists v2_providers_zero_data_retention_check,
  drop constraint if exists v2_providers_data_policy_tier_check,
  drop constraint if exists v2_providers_data_policy_confidence_check,
  drop constraint if exists v2_providers_data_policy_contract_mode_check,
  drop constraint if exists v2_providers_data_policy_variant_check,
  drop constraint if exists v2_providers_zdr_variant_integrity_check;

alter table public.v2_providers
  add constraint v2_providers_offer_scope_check
    check (offer_scope in ('global', 'regional', 'specialized')),
  add constraint v2_providers_residency_mode_check
    check (residency_mode in ('unknown', 'provider_managed', 'customer_selectable', 'account_selected')),
  add constraint v2_providers_zero_data_retention_check
    check (zero_data_retention in ('unknown', 'unsupported', 'optional', 'default')),
  add constraint v2_providers_data_policy_tier_check
    check (data_policy_tier in ('unknown', 'private', 'logs', 'trains')),
  add constraint v2_providers_data_policy_confidence_check
    check (data_policy_confidence in ('unknown', 'confirmed', 'maybe')),
  add constraint v2_providers_data_policy_contract_mode_check
    check (data_policy_contract_mode in ('none', 'customer_agreement', 'enterprise_agreement')),
  add constraint v2_providers_data_policy_variant_check
    check (data_policy_variant in ('standard', 'zdr')),
  add constraint v2_providers_zdr_variant_integrity_check
    check (
      data_policy_variant <> 'zdr'
      or (
        offer_scope = 'specialized'
        and zero_data_retention = 'default'
        and data_policy_tier = 'private'
        and data_policy_confidence = 'confirmed'
      )
    );

create index if not exists v2_providers_policy_variant_idx
  on public.v2_providers (provider_family_slug, data_policy_variant, offer_scope)
  where status not in ('disabled', 'deprecated');

comment on column public.v2_providers.data_policy_variant is
  'Policy-specific provider route. ZDR variants are separate provider rows and must guarantee ZDR by default.';

alter table public.v2_request_facts
  add column if not exists internal_dispatch_ms numeric(12, 3),
  add column if not exists gateway_total_ms numeric(12, 3);

alter table public.v2_request_facts
  drop constraint if exists v2_request_facts_gateway_timing_check;
alter table public.v2_request_facts
  add constraint v2_request_facts_gateway_timing_check
  check (
    (internal_dispatch_ms is null or internal_dispatch_ms >= 0)
    and (gateway_total_ms is null or gateway_total_ms >= 0)
  );

comment on column public.v2_request_facts.internal_dispatch_ms is
  'Time from gateway request entry to the selected upstream provider fetch boundary.';
comment on column public.v2_request_facts.gateway_total_ms is
  'Time from gateway request entry until the final response frame or completed response.';
