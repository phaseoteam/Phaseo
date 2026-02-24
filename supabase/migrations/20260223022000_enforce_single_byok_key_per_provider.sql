-- Enforce one BYOK key per team/provider.
-- Keep the newest key when legacy duplicates exist.

with ranked as (
  select
    id,
    row_number() over (
      partition by team_id, provider_id
      order by created_at desc, id desc
    ) as rn
  from public.byok_keys
)
delete from public.byok_keys bk
using ranked r
where bk.id = r.id
  and r.rn > 1;

create unique index if not exists byok_keys_team_provider_unique
  on public.byok_keys (team_id, provider_id);
