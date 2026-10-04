CREATE OR REPLACE FUNCTION public.get_monitor_history_stats (
  p_model       text DEFAULT NULL::text,
  p_provider    text DEFAULT NULL::text,
  p_change_kind text DEFAULT NULL::text
)
  RETURNS TABLE (
    total_changes bigint,
    total_commits bigint,
    generated_at  timestamp with time zone,
    last_sha      text,
    source_base   text,
    source_head   text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  with filtered as (
    select e.*
    from public.monitor_history_events e
    where (
      p_model is null
      or btrim(p_model) = ''
      or e.model_id = p_model
    )
      and (
        p_provider is null
        or btrim(p_provider) = ''
        or e.provider_slug = p_provider
      )
      and (
        p_change_kind is null
        or btrim(p_change_kind) = ''
        or p_change_kind = 'all'
        or e.change_kind = p_change_kind
      )
  ),
  counts as (
    select
      count(*)::bigint as total_changes,
      count(distinct filtered.commit_sha)::bigint as total_commits
    from filtered
  ),
  state as (
    select
      s.generated_at,
      s.last_sha,
      s.source_base,
      s.source_head
    from public.monitor_history_sync_state s
    where s.sync_key = 'catalog'
    limit 1
  )
  select
    counts.total_changes,
    counts.total_commits,
    state.generated_at,
    state.last_sha,
    state.source_base,
    state.source_head
  from counts
  left join state on true;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_monitor_history_stats"(text, text, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_monitor_history_stats"(text, text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_monitor_history_stats"(text, text, text) IS 'Returns filtered monitor history counts plus generator sync metadata.';

REVOKE ALL ON FUNCTION "public"."get_monitor_history_stats"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_monitor_history_stats"(text, text, text) TO "postgres";
