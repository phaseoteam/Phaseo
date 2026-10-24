CREATE OR REPLACE FUNCTION public.get_slack_agent_month_usage (
  p_installation_id uuid,
  p_period_start    date
)
  RETURNS TABLE (
    people  integer,
    answers bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- People answered and their pooled answers for one installation and UTC month,
  -- counted here so the settings page never sums rows itself. Served by the
  -- primary key (installation_id, period_start, slack_user_id).
  select count(*)::integer, coalesce(sum(person.answers), 0)::bigint
  from public.slack_agent_monthly_people person
  where person.installation_id = p_installation_id
    and person.period_start = p_period_start;
$function$;

COMMENT ON FUNCTION "public"."get_slack_agent_month_usage"(uuid, date) IS 'People the Slack agent answered and their pooled answers for one installation and UTC month, for the settings page.';

GRANT EXECUTE ON FUNCTION "public"."get_slack_agent_month_usage"(uuid, date) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_slack_agent_month_usage"(uuid, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_slack_agent_month_usage"(uuid, date) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_slack_agent_month_usage"(uuid, date) FROM PUBLIC, "anon", "authenticated";
