create view public.reporting_model_task_daily with (security_invoker = true) as
select usage.* from public.public_model_task_daily usage
where public.public_reporting_route_is_visible(usage.model_slug, null, usage.provider_slug);
revoke all on public.reporting_model_task_daily from public, anon, authenticated;
grant select on public.reporting_model_task_daily to service_role;
