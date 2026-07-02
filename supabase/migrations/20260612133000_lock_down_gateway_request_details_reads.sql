revoke select on public.gateway_request_details from authenticated;

drop policy if exists gateway_request_details_select_own_team on public.gateway_request_details;
drop policy if exists gateway_request_details_select_service on public.gateway_request_details;

create policy gateway_request_details_select_service
  on public.gateway_request_details
  for select
  to service_role
  using (true);

grant select on public.gateway_request_details to service_role;
