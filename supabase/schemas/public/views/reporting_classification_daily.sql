create view public.reporting_classification_daily with (security_invoker = true) as
select usage_date, workspace_id, classifier_id, primary_category, model_slug, provider_slug,
  coalesce(public_request_count, request_count) as request_count,
  coalesce(public_input_tokens, input_tokens) as input_tokens,
  coalesce(public_output_tokens, output_tokens) as output_tokens, updated_at
from public.request_classification_daily
where coalesce(public_request_count, request_count) > 0
  and public.public_reporting_route_is_visible(model_slug, null, provider_slug);
revoke all on public.reporting_classification_daily from public, anon, authenticated;
grant select on public.reporting_classification_daily to service_role;
