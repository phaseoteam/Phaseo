CREATE OR REPLACE FUNCTION public.get_benchmark_result_rankings (
  p_benchmark_ids       text[]  DEFAULT NULL::text[],
  p_model_id            text    DEFAULT NULL::text,
  p_include_hidden      boolean DEFAULT false,
  p_limit_per_benchmark integer DEFAULT NULL::integer
)
  RETURNS TABLE (
    result_id           uuid,
    model_id            text,
    benchmark_id        text,
    score               text,
    score_numeric       numeric,
    is_self_reported    boolean,
    other_info          text,
    source_link         text,
    created_at          timestamp with time zone,
    updated_at          timestamp with time zone,
    occur_idx           integer,
    variant             text,
    result_key          text,
    benchmark_rank      bigint,
    total_ranked_models bigint,
    is_primary_result   boolean,
    model_name          text,
    release_date        timestamp with time zone,
    announcement_date   timestamp with time zone,
    organisation_id     text,
    organisation_name   text,
    organisation_colour text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with target_benchmarks as (
    select
      b.id,
      b.ascending_order,
      b.type
    from private.v2_rpc_benchmarks_compat b
    where
      (p_benchmark_ids is null or b.id = any (p_benchmark_ids))
      and (
        p_model_id is null
        or exists (
          select 1
          from private.v2_rpc_benchmark_results_compat requested_result
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
    join private.v2_rpc_benchmark_results_compat result
      on result.benchmark_id = target.id
    join private.v2_rpc_models_compat model
      on model.model_id = result.model_id
    left join private.v2_rpc_labs_compat organisation
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

GRANT EXECUTE ON FUNCTION "public"."get_benchmark_result_rankings"(text[], text, boolean, integer) TO "service_role";

COMMENT ON FUNCTION "public"."get_benchmark_result_rankings"(text[], text, boolean, integer) IS 'Returns tie-aware model-level benchmark ranks derived from numeric result scores, while preserving every source-result variant for display.';

REVOKE ALL ON FUNCTION "public"."get_benchmark_result_rankings"(text[], text, boolean, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_benchmark_result_rankings"(text[], text, boolean, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_benchmark_result_rankings"(text[], text, boolean, integer) FROM PUBLIC, "anon", "authenticated";
