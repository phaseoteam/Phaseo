CREATE OR REPLACE FUNCTION public.get_public_top_models_with_metadata (
  p_time_range text    DEFAULT 'week'::text,
  p_limit      integer DEFAULT 6
)
  RETURNS TABLE (
    model_id          text,
    model_name        text,
    organisation_id   text,
    organisation_name text,
    total_tokens      bigint
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_since timestamptz;
  v_now timestamptz := now();
begin
  case p_time_range
    when 'today' then
      v_since := date_trunc('day', v_now);
    when 'week' then
      v_since := v_now - interval '7 days';
    when 'month' then
      v_since := date_trunc('month', v_now);
    else
      v_since := v_now - interval '7 days';
  end case;

  return query
  with base_requests as (
    select
      gr.provider,
      gr.model_id as raw_model_id,
      public.gateway_usage_total_tokens(gr.usage) as tokens
    from private.v2_rpc_gateway_requests_compat gr
    where gr.created_at >= v_since
      and gr.model_id is not null
      and gr.provider is not null
      and gr.provider <> ''
  ),
  resolved as (
    select
      br.raw_model_id,
      br.tokens,
      public.resolve_public_model_id(br.raw_model_id, br.provider) as canonical_model_id
    from base_requests br
  ),
  enriched as (
    select
      coalesce(r.canonical_model_id, r.raw_model_id) as resolved_model_id,
      coalesce(dm.name, r.raw_model_id) as resolved_model_name,
      coalesce(dm.organisation_id, org_guess.organisation_id) as resolved_org_id,
      coalesce(org.name, org_guess.name) as resolved_org_name,
      r.tokens
    from resolved r
    left join private.v2_rpc_models_compat dm
      on dm.model_id = r.canonical_model_id
    left join private.v2_rpc_labs_compat org
      on org.organisation_id = dm.organisation_id
    left join lateral (
      select o.organisation_id, o.name
      from private.v2_rpc_labs_compat o
      where lower(o.organisation_id) = lower(split_part(r.raw_model_id, '/', 1))
         or lower(o.name) = lower(split_part(r.raw_model_id, '/', 1))
      order by
        case
          when lower(o.organisation_id) = lower(split_part(r.raw_model_id, '/', 1))
            then 0
          else 1
        end
      limit 1
    ) org_guess on true
  ),
  aggregated as (
    select
      e.resolved_model_id,
      max(e.resolved_model_name) as resolved_model_name,
      max(e.resolved_org_id) as resolved_org_id,
      max(e.resolved_org_name) as resolved_org_name,
      sum(e.tokens)::bigint as summed_tokens
    from enriched e
    where e.tokens >= 0
    group by e.resolved_model_id
  )
  select
    a.resolved_model_id as model_id,
    a.resolved_model_name as model_name,
    a.resolved_org_id as organisation_id,
    a.resolved_org_name as organisation_name,
    a.summed_tokens as total_tokens
  from aggregated a
  order by a.summed_tokens desc
  limit greatest(1, p_limit);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_top_models_with_metadata"(text, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_top_models_with_metadata"(text, integer) TO "service_role";

COMMENT ON FUNCTION "public"."get_public_top_models_with_metadata"(text, integer) IS 'Public top models by token usage resolved to canonical API model ids with metadata enrichment.';

REVOKE ALL ON FUNCTION "public"."get_public_top_models_with_metadata"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_top_models_with_metadata"(text, integer) TO "postgres";
