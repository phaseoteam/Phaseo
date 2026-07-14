alter table public.email_outbox enable row level security;

revoke all on public.email_outbox from anon, authenticated;

drop policy if exists email_outbox_select_service on public.email_outbox;
create policy email_outbox_select_service
  on public.email_outbox
  for select
  to service_role
  using (true);

drop policy if exists email_outbox_insert_service on public.email_outbox;
create policy email_outbox_insert_service
  on public.email_outbox
  for insert
  to service_role
  with check (true);

drop policy if exists email_outbox_update_service on public.email_outbox;
create policy email_outbox_update_service
  on public.email_outbox
  for update
  to service_role
  using (true)
  with check (true);

grant select, insert, update on public.email_outbox to service_role;
