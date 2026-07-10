-- Keep model-link storage in sync with the titled-link catalogue rollout.
-- The web query selects kind/title, while platform remains for compatibility
-- with older writers during deployment.
alter table public.data_model_links
  add column if not exists kind text,
  add column if not exists title text;

update public.data_model_links
set kind = platform
where kind is null or btrim(kind) = '';

update public.data_model_links
set title = initcap(replace(coalesce(nullif(btrim(kind), ''), platform), '_', ' '))
where title is null or btrim(title) = '';

-- The new catalogue permits multiple links of the same kind and identifies a
-- link by URL. Remove exact per-model URL duplicates before changing the key.
with ranked_links as (
  select
    id,
    row_number() over (
      partition by model_id, url
      order by updated_at desc, created_at desc, id desc
    ) as duplicate_rank
  from public.data_model_links
)
delete from public.data_model_links links
using ranked_links ranked
where links.id = ranked.id
  and ranked.duplicate_rank > 1;

alter table public.data_model_links
  drop constraint if exists data_model_links_model_id_platform_key;

create unique index if not exists data_model_links_model_id_url_key
  on public.data_model_links (model_id, url);

notify pgrst, 'reload schema';
