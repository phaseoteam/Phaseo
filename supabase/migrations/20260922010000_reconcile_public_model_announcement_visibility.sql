-- Keep the public announcement visibility snapshot idempotent when a deployment
-- resumes after the migration history ordering fix.
alter table public.model_discovery_public_announcements
  add column if not exists public_visibility_snapshot boolean;

update public.model_discovery_public_announcements
set public_visibility_snapshot = coalesce(
  public_visibility_snapshot,
  not exists (
    select 1
    from public.v2_models as model
    where model.model_slug = model_discovery_public_announcements.model_slug
      and (
        model.hidden = true
        or lower(coalesce(model.status, '')) in ('draft', 'disabled', 'retired')
      )
  )
)
where public_visibility_snapshot is null;
