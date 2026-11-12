CREATE OR REPLACE FUNCTION public.gateway_feedback_summary (
  p_workspace_id       uuid,
  p_visible_preset_ids uuid[],
  p_group_by           text                     DEFAULT 'preset_id'::text,
  p_metadata_key       text                     DEFAULT NULL::text,
  p_request_id         text                     DEFAULT NULL::text,
  p_session_id         text                     DEFAULT NULL::text,
  p_preset_id          uuid                     DEFAULT NULL::uuid,
  p_test_run_id        uuid                     DEFAULT NULL::uuid,
  p_created_since      timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_created_until      timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_metadata_filters   jsonb                    DEFAULT '{}'::jsonb,
  p_limit              integer                  DEFAULT 5000
)
  RETURNS TABLE (
    group_value      text,
    count            bigint,
    positive         bigint,
    negative         bigint,
    partial          bigint,
    average_score    numeric,
    ratings          jsonb,
    last_feedback_at timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if p_group_by not in ('preset_id', 'test_run_id', 'metadata') then
    raise exception 'invalid feedback summary grouping' using errcode = '22023';
  end if;
  if p_group_by = 'metadata'
     and (p_metadata_key is null or p_metadata_key !~ '^[a-zA-Z0-9_.:-]{1,64}$') then
    raise exception 'valid metadata key required for metadata grouping' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_metadata_filters, '{}'::jsonb)) <> 'object' then
    raise exception 'metadata filters must be a JSON object' using errcode = '22023';
  end if;

  return query
  with filtered as (
    select
      case p_group_by
        when 'preset_id' then feedback.preset_id::text
        when 'test_run_id' then feedback.test_run_id::text
        when 'metadata' then feedback.metadata_dimensions ->> p_metadata_key
      end as summary_group,
      feedback.rating,
      feedback.score,
      feedback.created_at
    from public.gateway_feedback as feedback
    where feedback.workspace_id = p_workspace_id
      and (feedback.preset_id is null or feedback.preset_id = any(coalesce(p_visible_preset_ids, '{}'::uuid[])))
      and (p_request_id is null or feedback.request_id = p_request_id)
      and (p_session_id is null or feedback.session_id = p_session_id)
      and (p_preset_id is null or feedback.preset_id = p_preset_id)
      and (p_test_run_id is null or feedback.test_run_id = p_test_run_id)
      and (p_created_since is null or feedback.created_at >= p_created_since)
      and (p_created_until is null or feedback.created_at <= p_created_until)
      and feedback.metadata_dimensions @> coalesce(p_metadata_filters, '{}'::jsonb)
  ),
  grouped as (
    select summary_group,
      count(*) as feedback_count,
      count(*) filter (where rating in ('thumbs_up', 'correct')) as positive_count,
      count(*) filter (where rating in ('thumbs_down', 'incorrect', 'unsafe')) as negative_count,
      count(*) filter (where rating = 'partly_correct') as partial_count,
      avg(score) filter (where score is not null) as mean_score,
      max(created_at) as latest_feedback_at
    from filtered
    where summary_group is not null and summary_group <> ''
    group by summary_group
  ),
  rating_counts as (
    select summary_group, coalesce(rating, 'unrated') as rating_key, count(*) as rating_count
    from filtered
    where summary_group is not null and summary_group <> ''
    group by summary_group, coalesce(rating, 'unrated')
  ),
  rating_totals as (
    select summary_group, jsonb_object_agg(rating_key, rating_count) as rating_map
    from rating_counts group by summary_group
  )
  select grouped.summary_group, grouped.feedback_count, grouped.positive_count,
    grouped.negative_count, grouped.partial_count, grouped.mean_score,
    coalesce(rating_totals.rating_map, '{}'::jsonb), grouped.latest_feedback_at
  from grouped left join rating_totals using (summary_group)
  order by grouped.latest_feedback_at desc, grouped.summary_group asc
  limit greatest(1, least(coalesce(p_limit, 5000), 10000));
end;
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."gateway_feedback_summary"(uuid, uuid[], text, text, text, text, uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb, integer)
  TO "service_role";

COMMENT ON FUNCTION "public"."gateway_feedback_summary"(uuid, uuid[], text, text, text, text, uuid, uuid, timestamp with time zone, timestamp
  with time zone, jsonb, integer) IS 'Service-role-only feedback aggregation constrained to caller-visible presets.';

REVOKE ALL
  ON FUNCTION "public"."gateway_feedback_summary"(uuid, uuid[], text, text, text, text, uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb, integer)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."gateway_feedback_summary"(uuid, uuid[], text, text, text, text, uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb, integer)
  TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."gateway_feedback_summary"(uuid, uuid[], text, text, text, text, uuid, uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb, integer)
  FROM PUBLIC, "anon", "authenticated";
