-- Labs are routable when at least one first-party provider offer is routable.
-- Third-party routes do not change the lab's own routability.
update public.v2_labs lab
set routable = exists (
  select 1
  from public.v2_providers provider
  where provider.lab_slug = lab.lab_slug
    and provider.status not in ('disabled', 'deprecated')
    and provider.routable = true
    and provider.routing_enabled = true
),
updated_at = now();
