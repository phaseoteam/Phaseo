create view public.reporting_request_facts with (security_invoker = true) as
select fact.* from public.v2_request_facts fact
where fact.public_reporting_allowed
  and public.public_reporting_route_is_visible(coalesce(fact.routed_model_slug, fact.requested_model_slug), fact.provider_model_id);
revoke all on public.reporting_request_facts from public, anon, authenticated;
grant select on public.reporting_request_facts to service_role;
