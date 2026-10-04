CREATE TABLE "public"."v2_subscription_plans" (
  "plan_uuid"    uuid                     NOT NULL,
  "plan_id"      text                     NOT NULL,
  "name"         text                     NOT NULL,
  "lab_slug"     text,
  "description"  text,
  "frequency"    text,
  "price"        numeric,
  "currency"     text,
  "link"         text,
  "other_info"   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"   timestamp with time zone,
  "updated_at"   timestamp with time zone,
  "effective_to" timestamp with time zone,
  CONSTRAINT "v2_subscription_plans_pkey" PRIMARY KEY (plan_uuid)
);

ALTER TABLE "public"."v2_subscription_plans"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_subscription_plans
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE POLICY "v2_subscription_plans_public_select" ON "public"."v2_subscription_plans"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((effective_to IS NULL) OR (effective_to > now())));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_subscription_plans" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."v2_subscription_plans"."effective_to" IS 'End of active catalogue visibility; retained for catalogue history.';
