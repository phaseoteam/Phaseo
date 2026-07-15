create index if not exists gateway_feedback_workspace_created_preset_idx
  on public.gateway_feedback (workspace_id, created_at desc, preset_id)
  where preset_id is not null;

create index if not exists gateway_feedback_workspace_preset_rating_created_idx
  on public.gateway_feedback (workspace_id, preset_id, rating, created_at desc)
  where preset_id is not null;

create index if not exists gateway_observability_events_workspace_created_preset_idx
  on public.gateway_observability_events (workspace_id, occurred_at desc, preset_id)
  where preset_id is not null;

comment on column public.gateway_feedback.metadata is
  'Arbitrary developer-supplied feedback metadata. Use metadata_dimensions for bounded indexed cohort filters.';

comment on column public.gateway_feedback.metadata_dimensions is
  'Bounded flat string map for indexed preset feedback comparison filters such as user_tier, region, plan, cohort, or app_version.';

comment on index public.gateway_feedback_workspace_created_preset_idx is
  'Supports preset feedback comparison pages filtered by workspace and date range.';

comment on index public.gateway_feedback_workspace_preset_rating_created_idx is
  'Supports preset comparison summaries by rating within a workspace/date window.';
