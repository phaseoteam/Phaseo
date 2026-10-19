SET local check_function_bodies = off;

-- Monthly classifier spend, for classifier budgets and the settings page.

CREATE TABLE "public"."workspace_request_classifier_spend_monthly" (
  "classifier_id"   uuid                     NOT NULL,
  "workspace_id"    uuid                     NOT NULL,
  "month"           date                     NOT NULL,
  "classifications" bigint                   NOT NULL DEFAULT 0,
  "cost_nanos"      bigint                   NOT NULL DEFAULT 0,
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_request_classifier_spend_monthly_classifier_fkey" FOREIGN KEY (classifier_id, workspace_id) REFERENCES public.workspace_request_classifiers(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_request_classifier_spend_monthly_month_check" CHECK ((month = (date_trunc('month'::text, (month)::timestamp without time zone))::date)),
  CONSTRAINT "workspace_request_classifier_spend_monthly_pkey" PRIMARY KEY (classifier_id, month)
);

ALTER TABLE "public"."workspace_request_classifier_spend_monthly"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_request_classifier_spend_monthly_workspace_idx ON public.workspace_request_classifier_spend_monthly USING btree (workspace_id, month);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_request_classifier_spend_monthly"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_request_classifier_spend_monthly" IS 'Classifier calls and their cost per classifier and UTC calendar month, written by record_request_classifier_spend after each classification. The gateway reads it to pause a classifier at its monthly budget; settings show it as this month''s classifier spend.';

REVOKE ALL ON TABLE "public"."workspace_request_classifier_spend_monthly" FROM "service_role";

GRANT SELECT ON TABLE "public"."workspace_request_classifier_spend_monthly" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_request_classifier_spend_monthly" FROM "anon", "authenticated";

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
