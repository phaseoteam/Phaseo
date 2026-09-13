-- Install the invariant before backfilling, so a concurrent workspace insert
-- cannot land in the gap between those operations.
create or replace function public.ensure_workspace_settings_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.workspace_settings (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.ensure_workspace_settings_row() from public, anon, authenticated;

drop trigger if exists workspaces_ensure_settings on public.workspaces;
create trigger workspaces_ensure_settings
after insert on public.workspaces
for each row execute function public.ensure_workspace_settings_row();

-- Every workspace must have a settings row before gateway context enrichment.
insert into public.workspace_settings (workspace_id)
select w.id
from public.workspaces w
where not exists (
  select 1
  from public.workspace_settings ws
  where ws.workspace_id = w.id
)
on conflict (workspace_id) do nothing;

-- Free Laguna requests can still report a cache-read meter. Keep that meter
-- explicitly zero-priced so billing remains total when providers send it.
insert into public.v2_pricing_sku_meters (
  sku_id,
  meter_key,
  modality,
  direction,
  unit,
  unit_quantity,
  price_nanos,
  display_label,
  display_unit,
  billable,
  meter_order,
  metadata
)
select
  sku.sku_id,
  'cached_read_text_tokens',
  'text',
  'input',
  'token',
  1000000,
  0,
  'cached_read_text_tokens',
  '1M tokens',
  true,
  100,
  jsonb_build_object(
    'note', 'Free preview',
    'source', 'json',
    'priority', 100,
    'source_key', 'poolside:poolside/laguna-s-2.1:free:text.generate:2:cached_read_text_tokens:free',
    'time_windows', '[]'::jsonb,
    'billing_timestamp_basis', 'request_start'
  )
from public.v2_pricing_skus sku
where sku.provider_model_id = 'poolside:poolside/laguna-s-2.1:free'
  and sku.operation = 'text.generate'
  and sku.service_tier_slug = 'free'
on conflict (sku_id, meter_key) do update
set
  price_nanos = excluded.price_nanos,
  billable = excluded.billable,
  meter_order = excluded.meter_order,
  metadata = excluded.metadata,
  updated_at = now();
