CREATE TABLE "public"."v2_subscription_plan_models" (
  "plan_uuid"    uuid                     NOT NULL,
  "model_slug"   text                     NOT NULL,
  "model_info"   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "rate_limit"   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "other_info"   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "effective_to" timestamp with time zone,
  CONSTRAINT "v2_subscription_plan_models_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE,
  CONSTRAINT "v2_subscription_plan_models_pkey" PRIMARY KEY (plan_uuid, model_slug),
  CONSTRAINT "v2_subscription_plan_models_plan_uuid_fkey" FOREIGN KEY (plan_uuid) REFERENCES public.v2_subscription_plans(plan_uuid) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_subscription_plan_models"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_subscription_plan_models_model_idx ON public.v2_subscription_plan_models USING btree (model_slug, plan_uuid);

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_subscription_plan_models
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_subscription_plan_models
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_subscription_plan_models"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING (public.catalog_model_is_public(model_slug));

CREATE POLICY "v2_subscription_plan_models_public_select" ON "public"."v2_subscription_plan_models"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((effective_to IS NULL) OR (effective_to > now())));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_subscription_plan_models" TO "anon", "authenticated", "service_role";

alter table public.v2_subscription_plan_models
  add column access_mode text not null default 'unknown' check (access_mode in ('selectable','automatic','conditional','unknown')),
  add column access_channel text,
  add column conditions text,
  add column mapping_status text not null default 'unverified' check (mapping_status in ('confirmed','example','unverified')),
  add column source_url text,
  add column verified_at timestamptz,
  add column effective_from timestamptz not null default '-infinity';

create trigger subscription_model_identity before insert on public.v2_subscription_plan_models for each row execute function public.canonicalize_subscription_identity();
