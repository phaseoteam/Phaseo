-- Keep the logical request linked to the concrete route selected by its
-- provider attempt. This also covers legacy callers that omit provider_model_id
-- on the top-level event but provide an exact route on attempt ingestion.

create or replace function public.sync_v2_request_fact_provider_model_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider_model_id is not null then
    update public.v2_request_facts request
    set provider_model_id = new.provider_model_id
    where request.request_event_id = new.request_event_id
      and request.provider_model_id is distinct from new.provider_model_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_v2_request_fact_provider_model_id
  on public.v2_request_attempts;
create trigger sync_v2_request_fact_provider_model_id
after insert or update of provider_model_id on public.v2_request_attempts
for each row
execute function public.sync_v2_request_fact_provider_model_id();

update public.v2_request_facts request
set provider_model_id = (
  select attempt.provider_model_id
  from public.v2_request_attempts attempt
  where attempt.request_event_id = request.request_event_id
    and attempt.provider_model_id is not null
  order by attempt.success desc, attempt.attempt_number desc
  limit 1
)
where request.provider_model_id is null
  and exists (
    select 1
    from public.v2_request_attempts attempt
    where attempt.request_event_id = request.request_event_id
      and attempt.provider_model_id is not null
  );

revoke all on function public.sync_v2_request_fact_provider_model_id()
  from public, anon, authenticated;
grant execute on function public.sync_v2_request_fact_provider_model_id()
  to service_role;
