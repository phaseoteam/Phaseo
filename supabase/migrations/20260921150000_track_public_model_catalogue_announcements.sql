-- Track the catalog lifecycle observed when each public model announcement was
-- queued so an existing model can be announced when it later becomes released.
alter table public.model_discovery_public_announcements
  add column if not exists catalogue_status_snapshot text;

-- Recover release transitions that happened while the previous notifier only
-- tracked newly inserted models. Leave currently released baseline/announced
-- rows eligible only when their release date is newer than the notifier's last
-- observation; this avoids announcing the whole existing catalog.
update public.model_discovery_public_announcements as announcement
set catalogue_status_snapshot = case
  when announcement.status in ('baseline', 'announced')
    and lower(coalesce(model.catalogue_status, '')) in ('preview', 'available', 'limited_access')
    and model.released_at is not null
    and model.released_at > coalesce(announcement.announced_at, announcement.first_seen_at)
    then 'unknown'
  else model.catalogue_status
end
from public.v2_models as model
where model.model_slug = announcement.model_slug
  and announcement.catalogue_status_snapshot is null;

comment on column public.model_discovery_public_announcements.catalogue_status_snapshot is
  'Lifecycle status captured to detect the next public catalog release transition.';
