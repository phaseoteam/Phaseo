create view public.reporting_provider_health_daily with (security_invoker = true) as
select usage.* from public.v2_public_provider_health_daily usage
where public.public_reporting_route_is_visible(usage.model_slug, usage.provider_model_id);
revoke all on public.reporting_provider_health_daily from public, anon, authenticated;
grant select on public.reporting_provider_health_daily to service_role;
