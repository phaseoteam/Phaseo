create view public.reporting_effective_pricing_daily with (security_invoker = true) as
select usage.* from public.v2_public_effective_pricing_daily usage
where public.public_reporting_route_is_visible(usage.model_slug, null, usage.provider_id);
revoke all on public.reporting_effective_pricing_daily from public, anon, authenticated;
grant select on public.reporting_effective_pricing_daily to service_role;
