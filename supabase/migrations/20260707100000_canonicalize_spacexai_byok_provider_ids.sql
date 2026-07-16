-- Canonicalize legacy xAI BYOK provider ids after the provider rename to SpaceXAI.
-- The application now writes SpaceXAI BYOK keys as spacex-ai, so this migration
-- hard-moves any leftover legacy rows to the canonical provider id.

with ranked_spacexai_keys as (
  select
    id,
    provider_id,
    lower(btrim(provider_id)) as normalized_provider_id,
    row_number() over (
      partition by workspace_id
      order by
        -- Preserve the key the workspace is actually using before preferring
        -- the canonical spelling. Provider ids are normalized below.
        always_use desc,
        enabled desc,
        last_verified_at desc nulls last,
        last_used_at desc nulls last,
        created_at desc,
        case when lower(btrim(provider_id)) = 'spacex-ai' then 0 else 1 end,
        case lower(btrim(provider_id)) when 'x-ai' then 0 when 'xai' then 1 else 2 end,
        id
    ) as keep_rank
  from public.byok_keys
  where lower(btrim(provider_id)) in ('spacex-ai', 'x-ai', 'xai')
),
deleted_duplicate_spacexai_keys as (
  delete from public.byok_keys bk
  using ranked_spacexai_keys ranked
  where bk.id = ranked.id
    and ranked.keep_rank > 1
  returning bk.id
)
update public.byok_keys bk
set provider_id = 'spacex-ai'
from ranked_spacexai_keys ranked
where bk.id = ranked.id
  and ranked.keep_rank = 1
  and ranked.provider_id <> 'spacex-ai';
