CREATE OR REPLACE FUNCTION public.record_request_classifier_spend (
  p_workspace_id uuid,
  p_classifier_id uuid,
  p_cost_nanos bigint
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- A classifier deleted mid-request matches no row and records nothing.
  insert into public.workspace_request_classifier_spend_monthly as spend
    (classifier_id, workspace_id, month, classifications, cost_nanos, updated_at)
  select classifier.id, classifier.workspace_id,
    date_trunc('month', now() at time zone 'utc')::date,
    1, greatest(coalesce(p_cost_nanos, 0), 0), now()
  from public.workspace_request_classifiers classifier
  where classifier.id = p_classifier_id and classifier.workspace_id = p_workspace_id
  on conflict (classifier_id, month) do update
  set classifications = spend.classifications + 1,
    cost_nanos = spend.cost_nanos + excluded.cost_nanos,
    updated_at = now();
$function$;

COMMENT ON FUNCTION "public"."record_request_classifier_spend"(uuid, uuid, bigint) IS 'Adds one classification and its cost to the classifier''s current UTC month.';

GRANT EXECUTE ON FUNCTION "public"."record_request_classifier_spend"(uuid, uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_request_classifier_spend"(uuid, uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_request_classifier_spend"(uuid, uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_request_classifier_spend"(uuid, uuid, bigint) FROM PUBLIC, "anon", "authenticated";
