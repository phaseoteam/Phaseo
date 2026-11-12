-- phaseo:allow-destructive-migration reason: Remove only derived public reporting rows for staged/internal scopes so a later release cannot expose private history; source facts, private usage, classification totals and billing are retained.
-- Classify retained legacy history before a staged model can be released.
-- Change only public reporting eligibility; private usage and billing remain intact.
-- Classification aggregates outlive their source contributions. Persist a
-- separate public snapshot, excluding known private contributions and every
-- currently staged/internal cohort; never fall back to private totals later.
with private_counts as (
  select contribution.occurred_at::date usage_date, contribution.workspace_id,
    classification.classifier_id, classification.primary_category, contribution.model_slug,
    coalesce(contribution.provider_slug, '') provider_slug,
    count(*) request_count, coalesce(sum(contribution.input_tokens),0) input_tokens,
    coalesce(sum(contribution.output_tokens),0) output_tokens
  from public.data_contributions contribution
  join public.request_classifications classification on classification.contribution_id = contribution.id
  where not contribution.public_reporting_allowed
  group by 1,2,3,4,5,6
), snapshot as (
  select usage.*, coalesce(private.request_count,0) private_requests,
    coalesce(private.input_tokens,0) private_input, coalesce(private.output_tokens,0) private_output,
    public.public_reporting_route_is_visible(usage.model_slug, null, usage.provider_slug)
    and public.public_reporting_route_is_visible(usage.model_slug, null, usage.provider_slug,
      usage.usage_date::timestamptz + interval '1 day' - interval '1 microsecond') visible
  from public.request_classification_daily usage
  left join private_counts private using (usage_date, workspace_id, classifier_id, primary_category, model_slug, provider_slug)
  where usage.public_request_count is null
)
update public.request_classification_daily usage set
  public_request_count = case when snapshot.visible then greatest(snapshot.request_count-snapshot.private_requests,0) else 0 end,
  public_input_tokens = case when snapshot.visible then greatest(snapshot.input_tokens-snapshot.private_input,0) else 0 end,
  public_output_tokens = case when snapshot.visible then greatest(snapshot.output_tokens-snapshot.private_output,0) else 0 end
from snapshot
where usage.usage_date = snapshot.usage_date and usage.workspace_id = snapshot.workspace_id
  and usage.classifier_id = snapshot.classifier_id and usage.primary_category = snapshot.primary_category
  and usage.model_slug = snapshot.model_slug and usage.provider_slug = snapshot.provider_slug;

-- Remove existing public rollups for unreleased models/internal routes so a
-- later release cannot revive them. Meter rows follow their parent's cascade.
delete from public.v2_public_usage_daily usage
where not public.public_reporting_route_is_visible(usage.model_slug, usage.provider_model_id);
delete from public.v2_public_usage_hourly usage
where not public.public_reporting_route_is_visible(usage.model_slug, usage.provider_model_id);
delete from public.public_model_user_usage_daily usage
where not public.public_reporting_route_is_visible(usage.model_id, null, usage.provider_id);
delete from public.public_model_workspace_usage_weekly usage
where not public.public_reporting_route_is_visible(usage.model_id);
delete from public.public_model_task_daily usage
where not public.public_reporting_route_is_visible(usage.model_slug, null, usage.provider_slug);
delete from public.v2_public_effective_pricing_daily usage
where not public.public_reporting_route_is_visible(usage.model_slug, null, usage.provider_id);
delete from public.v2_public_provider_health_daily usage
where not public.public_reporting_route_is_visible(usage.model_slug, usage.provider_model_id);
