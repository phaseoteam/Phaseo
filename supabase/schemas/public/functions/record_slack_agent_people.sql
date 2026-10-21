CREATE OR REPLACE FUNCTION public.record_slack_agent_people (
  p_installation_id uuid,
  p_period_start    date,
  p_people          jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_count integer;
begin
  if p_period_start is null or p_period_start <> date_trunc('month', p_period_start)::date then
    raise exception 'invalid_period_start' using errcode = '22023';
  end if;
  if p_people is null or jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) > 1000 then
    raise exception 'invalid_people' using errcode = '22023';
  end if;

  -- The meter sends running totals, so a retried or repeated flush can only raise
  -- a count, never add it twice.
  insert into public.slack_agent_monthly_people as person
    (installation_id, period_start, slack_user_id, first_answer_at, answers, updated_at)
  select installation.id, p_period_start, entry.slack_user_id, entry.first_answer_at,
    greatest(coalesce(entry.answers, 0), 0), now()
  from public.slack_installations installation
  cross join jsonb_to_recordset(p_people) as entry(slack_user_id text, first_answer_at timestamptz, answers bigint)
  where installation.id = p_installation_id
  on conflict (installation_id, period_start, slack_user_id) do update
  set answers = greatest(person.answers, excluded.answers),
    first_answer_at = least(person.first_answer_at, excluded.first_answer_at),
    updated_at = now()
  where excluded.answers > person.answers or excluded.first_answer_at < person.first_answer_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

COMMENT ON FUNCTION "public"."record_slack_agent_people"(uuid, date, jsonb) IS 'Upserts running totals [{slack_user_id, first_answer_at, answers}] for one installation and UTC month from the Slack Worker''s meter. Counts only ever rise, so repeated flushes are safe. Returns the rows changed.';

GRANT EXECUTE ON FUNCTION "public"."record_slack_agent_people"(uuid, date, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_slack_agent_people"(uuid, date, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_slack_agent_people"(uuid, date, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_slack_agent_people"(uuid, date, jsonb) FROM PUBLIC, "anon", "authenticated";
