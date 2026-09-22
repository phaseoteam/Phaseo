-- This recovery migration intentionally sorts immediately before the pending
-- catalogue repair that was committed to main but rejected by production's
-- append-only trigger. The guard links make its lab deletion predicate a no-op.
-- phaseo:allow-production-history-backfill reason: guard an unapplied migration that conflicts with append-only catalogue history

insert into public.v2_lab_links (lab_slug, platform, url)
select
  lab.lab_slug,
  'catalogue-repair-guard',
  'https://phaseo.app/models'
from public.v2_labs as lab
where lab.lab_slug in ('mistralai', 'ibm-granite', 'xai')
on conflict (lab_slug, platform, url) do nothing;
