-- Stable dictionary rows for normalized V1.1 offers. Preserve existing rows
-- and legacy provider-specific tier identities and their historical prices.
insert into public.v2_service_tiers(service_tier_slug,display_name)
values ('standard','Standard'),('fast','Fast'),('ultrafast','Ultrafast'),('flex','Flex'),('batch','Batch')
on conflict(service_tier_slug) do nothing;
