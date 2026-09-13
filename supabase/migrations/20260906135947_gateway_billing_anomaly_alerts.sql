-- Capture billing anomalies in the same transaction as the durable job update.
-- Route only to a service-managed operations Slack destination, never customer routes.
create table public.gateway_billing_alert_config (
  singleton boolean primary key default true check (singleton),
  destination_id uuid references public.notification_destinations(id) on delete set null
);
insert into public.gateway_billing_alert_config(singleton) values (true);

create table public.gateway_billing_alerts (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  workspace_id uuid not null,
  resource_id text not null,
  kind text not null check (kind in ('video', 'batch')),
  provider text,
  reason text not null check (reason = 'unexpected_zero_cost'),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  event_id uuid references public.email_outbox(id) on delete restrict,
  unique(operation_id, reason)
);
create index gateway_billing_alerts_open_idx on public.gateway_billing_alerts(created_at)
  where status = 'open';
alter table public.gateway_billing_alert_config enable row level security;
alter table public.gateway_billing_alerts enable row level security;
revoke all on public.gateway_billing_alert_config, public.gateway_billing_alerts from public, anon, authenticated;
grant select, insert, update, delete on public.gateway_billing_alert_config, public.gateway_billing_alerts to service_role;

create function public.queue_gateway_billing_alert(p_alert_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  alert public.gateway_billing_alerts%rowtype;
  destination public.notification_destinations%rowtype;
  event_uuid uuid;
begin
  select * into alert from public.gateway_billing_alerts where id = p_alert_id for update;
  if not found or alert.event_id is not null or alert.status <> 'open' then return false; end if;
  select d.* into destination
  from public.gateway_billing_alert_config c
  join public.notification_destinations d on d.id = c.destination_id
  where c.singleton and d.status = 'active' and d.type = 'slack';
  if not found then return false; end if;

  -- email_outbox is the existing notification event store. This event has no
  -- email leg: sent_at closes that legacy drain; Slack delivery has its own status.
  insert into public.email_outbox(kind, template, to_email, subject, workspace_id, dedupe_key, payload, sent_at)
  values ('billing_anomaly', 'notification_only', '', 'Unexpected zero-cost generation',
    destination.workspace_id, 'billing_anomaly:' || alert.id,
    jsonb_build_object(
      'title', 'Unexpected zero-cost generation',
      'message', format('A paid %s job was priced at zero. Workspace: %s. Job: %s. Provider: %s. Review billing and the reservation before releasing credit. Alert: %s.',
        alert.kind, alert.workspace_id, alert.resource_id, coalesce(alert.provider, 'unknown'), alert.id),
      'alert_id', alert.id, 'source_workspace_id', alert.workspace_id,
      'resource_id', alert.resource_id, 'kind', alert.kind, 'reason', alert.reason), now())
  returning id into event_uuid;

  insert into public.notification_routed_events(event_id, workspace_id)
    values(event_uuid, destination.workspace_id);
  insert into public.notification_delivery_attempts(event_id, destination_id, workspace_id)
    values(event_uuid, destination.id, destination.workspace_id);
  update public.gateway_billing_alerts set event_id = event_uuid where id = alert.id;
  return true;
end;
$$;
revoke all on function public.queue_gateway_billing_alert(uuid) from public, anon, authenticated;
grant execute on function public.queue_gateway_billing_alert(uuid) to service_role;

create function public.capture_gateway_billing_alert()
returns trigger language plpgsql security definer set search_path = public as $$
declare alert_uuid uuid;
begin
  if new.billed_at is not null then
    update public.gateway_billing_alerts set status = 'resolved', resolved_at = now()
    where operation_id = new.id and status = 'open';
    return new;
  end if;
  if new.kind not in ('video', 'batch') or new.meta->>'billingReason' is distinct from 'unexpected_zero_cost' then
    return new;
  end if;
  insert into public.gateway_billing_alerts(operation_id, workspace_id, resource_id, kind, provider, reason)
  values(new.id, new.workspace_id, new.internal_id, new.kind, new.provider, 'unexpected_zero_cost')
  on conflict(operation_id, reason) do nothing;
  select id into alert_uuid from public.gateway_billing_alerts
    where operation_id = new.id and reason = 'unexpected_zero_cost';
  perform public.queue_gateway_billing_alert(alert_uuid);
  return new;
end;
$$;
revoke all on function public.capture_gateway_billing_alert() from public, anon, authenticated;
create trigger gateway_billing_alert_capture
after insert or update of meta, billed_at on public.gateway_async_operations
for each row execute function public.capture_gateway_billing_alert();

-- Retain pre-existing unresolved anomalies as well; routing is configured separately.
insert into public.gateway_billing_alerts(operation_id, workspace_id, resource_id, kind, provider, reason)
select id, workspace_id, internal_id, kind, provider, 'unexpected_zero_cost'
from public.gateway_async_operations
where kind in ('video','batch') and billed_at is null and meta->>'billingReason' = 'unexpected_zero_cost'
on conflict(operation_id, reason) do nothing;
