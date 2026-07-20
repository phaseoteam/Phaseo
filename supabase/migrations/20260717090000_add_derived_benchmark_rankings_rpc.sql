-- Derive benchmark ranks from source results instead of persisting catalogue-wide
-- rank updates. A model occupies one position per benchmark even when multiple
-- source or harness variants are stored for it.

alter table public.data_benchmark_results
  add column if not exists score_numeric numeric
  generated always as (
    substring(score from '[-+]?[0-9]*\.?[0-9]+')::numeric
  ) stored;

create index if not exists data_benchmark_results_benchmark_model_score_idx
  on public.data_benchmark_results (benchmark_id, model_id, score_numeric)
  where score_numeric is not null;

create index if not exists data_benchmark_results_model_benchmark_idx
  on public.data_benchmark_results (model_id, benchmark_id);

create or replace function public.get_benchmark_result_rankings(
  p_benchmark_ids text[] default null,
  p_model_id text default null,
  p_include_hidden boolean default false,
  p_limit_per_benchmark integer default null
)
returns table (
  result_id uuid,
  model_id text,
  benchmark_id text,
  score text,
  score_numeric numeric,
  is_self_reported boolean,
  other_info text,
  source_link text,
  created_at timestamptz,
  updated_at timestamptz,
  occur_idx integer,
  variant text,
  result_key text,
  benchmark_rank bigint,
  total_ranked_models bigint,
  is_primary_result boolean,
  model_name text,
  release_date timestamptz,
  announcement_date timestamptz,
  organisation_id text,
  organisation_name text,
  organisation_colour text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with target_benchmarks as (
    select
      b.id,
      b.ascending_order,
      b.type
    from public.data_benchmarks b
    where
      (p_benchmark_ids is null or b.id = any (p_benchmark_ids))
      and (
        p_model_id is null
        or exists (
          select 1
          from public.data_benchmark_results requested_result
          where requested_result.benchmark_id = b.id
            and requested_result.model_id = p_model_id
        )
      )
  ),
  scoped_results as (
    select
      result.*,
      model.name as model_name,
      model.release_date,
      model.announcement_date,
      model.organisation_id,
      organisation.name as organisation_name,
      organisation.colour as organisation_colour,
      target.ascending_order,
      case
        when target.type = 'percentage'
          and abs(result.score_numeric) > 0
          and abs(result.score_numeric) <= 1
          then result.score_numeric * 100
        else result.score_numeric
      end as comparable_score
    from target_benchmarks target
    join public.data_benchmark_results result
      on result.benchmark_id = target.id
    join public.data_models model
      on model.model_id = result.model_id
    left join public.data_organisations organisation
      on organisation.organisation_id = model.organisation_id
    where p_include_hidden or not coalesce(model.hidden, false)
  ),
  model_scores as (
    select
      scoped.benchmark_id,
      scoped.model_id,
      bool_or(scoped.ascending_order is false) as lower_is_better,
      case
        when bool_or(scoped.ascending_order is false)
          then min(scoped.comparable_score)
        else max(scoped.comparable_score)
      end as primary_score
    from scoped_results scoped
    where scoped.comparable_score is not null
    group by scoped.benchmark_id, scoped.model_id
  ),
  ranked_models as (
    select
      scores.benchmark_id,
      scores.model_id,
      scores.primary_score,
      rank() over (
        partition by scores.benchmark_id
        order by
          case when scores.lower_is_better then scores.primary_score end asc nulls last,
          case when not scores.lower_is_better then scores.primary_score end desc nulls last
      ) as benchmark_rank,
      count(*) over (
        partition by scores.benchmark_id
      ) as total_ranked_models
    from model_scores scores
  ),
  selected_models as (
    select
      roster.benchmark_id,
      roster.model_id,
      ranked.primary_score,
      ranked.benchmark_rank,
      ranked.total_ranked_models
    from (
      select distinct scoped.benchmark_id, scoped.model_id
      from scoped_results scoped
    ) roster
    left join ranked_models ranked
      on ranked.benchmark_id = roster.benchmark_id
     and ranked.model_id = roster.model_id
    where
      (p_model_id is null or roster.model_id = p_model_id)
      and (
        p_limit_per_benchmark is null
        or ranked.benchmark_rank <= greatest(p_limit_per_benchmark, 1)
      )
  )
  select
    scoped.id as result_id,
    scoped.model_id,
    scoped.benchmark_id,
    scoped.score,
    scoped.score_numeric,
    scoped.is_self_reported,
    scoped.other_info,
    scoped.source_link,
    scoped.created_at,
    scoped.updated_at,
    scoped.occur_idx,
    scoped.variant,
    scoped.result_key,
    ranked.benchmark_rank,
    ranked.total_ranked_models,
    ranked.primary_score is not null
      and scoped.comparable_score is not distinct from ranked.primary_score
      as is_primary_result,
    scoped.model_name,
    scoped.release_date,
    scoped.announcement_date,
    scoped.organisation_id,
    scoped.organisation_name,
    scoped.organisation_colour
  from scoped_results scoped
  join selected_models ranked
    on ranked.benchmark_id = scoped.benchmark_id
   and ranked.model_id = scoped.model_id
  order by
    scoped.benchmark_id,
    ranked.benchmark_rank,
    scoped.model_id,
    scoped.occur_idx,
    scoped.id;
$function$;

comment on function public.get_benchmark_result_rankings(text[], text, boolean, integer)
  is 'Returns tie-aware model-level benchmark ranks derived from numeric result scores, while preserving every source-result variant for display.';

revoke execute on function public.get_benchmark_result_rankings(text[], text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.get_benchmark_result_rankings(text[], text, boolean, integer)
  to service_role;
