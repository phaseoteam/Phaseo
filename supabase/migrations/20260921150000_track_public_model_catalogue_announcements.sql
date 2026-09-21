-- Track the catalog lifecycle observed when each public model announcement was
-- queued so an existing model can be announced when it later becomes available.
alter table public.model_discovery_public_announcements
  add column if not exists catalogue_status_snapshot text;

alter table public.model_discovery_public_announcements
  add column if not exists public_visibility_snapshot boolean;

-- Recover known availability transitions that happened while the previous
-- notifier only tracked newly inserted models. Restrict the backfill to models
-- whose release date is newer than the notifier's last observation so the
-- existing available catalog is not announced wholesale.
update public.model_discovery_public_announcements as announcement
set catalogue_status_snapshot = case
  when announcement.status in ('baseline', 'announced')
    and lower(coalesce(model.catalogue_status, '')) = 'available'
    and model.released_at is not null
    and model.released_at > coalesce(announcement.announced_at, announcement.first_seen_at)
    then 'unknown'
  else model.catalogue_status
end
from public.v2_models as model
where model.model_slug = announcement.model_slug
  and announcement.catalogue_status_snapshot is null;

update public.model_discovery_public_announcements as announcement
set public_visibility_snapshot = case
  when coalesce(model.hidden, false) then false
  when lower(coalesce(model.status, '')) in ('draft', 'disabled', 'retired') then false
  else true
end
from public.v2_models as model
where model.model_slug = announcement.model_slug
  and announcement.public_visibility_snapshot is null;

comment on column public.model_discovery_public_announcements.catalogue_status_snapshot is
  'Lifecycle status captured to detect a public catalog transition to available.';

comment on column public.model_discovery_public_announcements.public_visibility_snapshot is
  'Whether the model was public when the announcement state was last observed.';
