create table public.v2_subscription_feature_definitions (
  feature_key text primary key,
  label text not null,
  category text not null default 'General',
  value_type text not null default 'text' check (value_type in ('boolean','number','text'))
);

alter table public.v2_subscription_feature_definitions enable row level security;
create policy v2_subscription_feature_definitions_select on public.v2_subscription_feature_definitions for select to anon,authenticated using (true);
grant select on public.v2_subscription_feature_definitions to anon,authenticated;
grant select,insert,update,delete on public.v2_subscription_feature_definitions to service_role;
create trigger catalogue_row_history after insert or update or delete on public.v2_subscription_feature_definitions for each row execute function catalogue_private.record_row_history();
create trigger catalogue_no_removal before delete or truncate on public.v2_subscription_feature_definitions for each statement execute function public.prevent_catalogue_removal();
