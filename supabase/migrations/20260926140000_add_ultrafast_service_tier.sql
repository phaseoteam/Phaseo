insert into public.v2_service_tiers (service_tier_slug, display_name, status, metadata)
values (
  'ultrafast',
  'Ultrafast',
  'active',
  jsonb_build_object('source', 'v2_canonical')
)
on conflict (service_tier_slug) do update set
  display_name = excluded.display_name,
  status = excluded.status,
  metadata = public.v2_service_tiers.metadata || excluded.metadata,
  updated_at = now();
