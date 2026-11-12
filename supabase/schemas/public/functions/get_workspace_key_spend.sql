CREATE OR REPLACE FUNCTION public.get_workspace_key_spend (
  p_workspace_id uuid,
  p_from         date,
  p_to           date
)
  RETURNS TABLE (
    key_id     uuid,
    key_name   text,
    key_prefix text,
    requests   bigint,
    cost_nanos bigint
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
-- A workspace's requests and spend per API key between two inclusive UTC dates,
-- summed here from the 15-minute rollup, the 100 keys that cost the most first.
-- A null key_id is usage without a key (for example the web chat). Unlike
-- get_workspace_key_usage, which checks the signed-in member and only counts
-- since one day, this takes any range and is for the service role only: the
-- Slack agent checks the asker is a linked member first.
begin
  if p_workspace_id is null or p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'range_too_long' using errcode = '22023';
  end if;

  return query
  select usage.key_id,
    api_key.name,
    api_key.prefix,
    sum(usage.requests)::bigint,
    sum(usage.cost_nanos)::bigint
  from public.v2_private_usage_15m usage
  left join public.keys api_key on api_key.id = usage.key_id and api_key.workspace_id = p_workspace_id
  -- Served by the (workspace_id, bucket_start, ...) unique index.
  where usage.workspace_id = p_workspace_id
    and usage.bucket_start >= p_from::timestamp at time zone 'UTC'
    and usage.bucket_start < (p_to + 1)::timestamp at time zone 'UTC'
  group by usage.key_id, api_key.name, api_key.prefix
  order by sum(usage.cost_nanos) desc, usage.key_id nulls last
  limit 100;
end;
$function$;

COMMENT ON FUNCTION "public"."get_workspace_key_spend"(uuid, date, date) IS 'A workspace''s requests and spend per API key between two inclusive UTC dates, summed in the database from v2_private_usage_15m (top 100 keys). For the Slack agent''s usage tools; service role only.';

GRANT EXECUTE ON FUNCTION "public"."get_workspace_key_spend"(uuid, date, date) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_workspace_key_spend"(uuid, date, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_key_spend"(uuid, date, date) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_workspace_key_spend"(uuid, date, date) FROM PUBLIC, "anon", "authenticated";
