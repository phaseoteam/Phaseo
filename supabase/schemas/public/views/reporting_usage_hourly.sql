create view public.reporting_usage_hourly with (security_invoker = true) as
select usage.* from public.v2_public_usage_hourly usage
where public.public_reporting_route_is_visible(usage.model_slug, usage.provider_model_id);
revoke all on public.reporting_usage_hourly from public, anon, authenticated;
grant select on public.reporting_usage_hourly to service_role, anon, authenticated;
