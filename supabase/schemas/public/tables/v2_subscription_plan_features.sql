CREATE TABLE "public"."v2_subscription_plan_features" (
  "plan_uuid"           uuid                     NOT NULL,
  "feature_name"        text                     NOT NULL,
  "feature_value"       text,
  "feature_description" text,
  "other_info"          jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "effective_to"        timestamp with time zone,
  CONSTRAINT "v2_subscription_plan_features_pkey" PRIMARY KEY (plan_uuid, feature_name),
  CONSTRAINT "v2_subscription_plan_features_plan_uuid_fkey" FOREIGN KEY (plan_uuid) REFERENCES public.v2_subscription_plans(plan_uuid) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_subscription_plan_features"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_subscription_plan_features
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE POLICY "v2_subscription_plan_features_public_select" ON "public"."v2_subscription_plan_features"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((((effective_to IS NULL) OR (effective_to > now())) AND (EXISTS ( SELECT 1
   FROM public.v2_subscription_plans plan
  WHERE ((plan.plan_uuid = v2_subscription_plan_features.plan_uuid) AND ((plan.effective_to IS NULL) OR (plan.effective_to > now())))))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_subscription_plan_features" TO "anon", "authenticated", "service_role";
