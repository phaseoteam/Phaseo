create view public.reporting_model_workspace_usage_weekly with (security_invoker = true) as
select usage.* from public.public_model_workspace_usage_weekly usage
where public.public_reporting_route_is_visible(usage.model_id);
revoke all on public.reporting_model_workspace_usage_weekly from public, anon, authenticated;
grant select on public.reporting_model_workspace_usage_weekly to service_role;
