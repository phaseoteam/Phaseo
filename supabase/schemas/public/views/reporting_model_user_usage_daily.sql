create view public.reporting_model_user_usage_daily with (security_invoker = true) as
select usage.* from public.public_model_user_usage_daily usage
where public.public_reporting_route_is_visible(usage.model_id, null, usage.provider_id);
revoke all on public.reporting_model_user_usage_daily from public, anon, authenticated;
grant select on public.reporting_model_user_usage_daily to service_role;
