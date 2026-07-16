-- Correct the keeper ordering from the already-applied SpaceXAI provider-id
-- migration. Preserve the credential the workspace is actively using before
-- preferring a provider-id spelling, then normalize the surviving row.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Keep the reconciliation atomic with respect to concurrent credential
-- writes. This table is small and the lock is held only for the statements
-- below inside the migration transaction.
lock table public.byok_keys in share row exclusive mode;

with ranked_spacexai_keys as (
  select
    id,
    row_number() over (
      partition by workspace_id
      order by
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
)
delete from public.byok_keys bk
using ranked_spacexai_keys ranked
where bk.id = ranked.id
  and ranked.keep_rank > 1;

update public.byok_keys
set provider_id = 'spacex-ai'
where lower(btrim(provider_id)) in ('x-ai', 'xai');
