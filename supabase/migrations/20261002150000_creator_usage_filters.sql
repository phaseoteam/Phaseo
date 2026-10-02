-- Backend-only joins avoid truncated creator key lists and long PostgREST URLs.
create view public.v2_web_gateway_requests_by_creator
with (security_invoker = true) as
select requests.*, keys.created_by as key_created_by
from public.v2_web_gateway_requests requests
join public.keys keys on keys.id = requests.key_id and keys.workspace_id = requests.workspace_id;

create view public.v2_request_facts_by_creator
with (security_invoker = true) as
select facts.*, keys.created_by as key_created_by
from public.v2_request_facts facts
join public.keys keys on keys.id = facts.key_id and keys.workspace_id = facts.workspace_id;

revoke all on public.v2_web_gateway_requests_by_creator, public.v2_request_facts_by_creator from public, anon, authenticated;
grant select on public.v2_web_gateway_requests_by_creator, public.v2_request_facts_by_creator to service_role;

notify pgrst, 'reload schema';
