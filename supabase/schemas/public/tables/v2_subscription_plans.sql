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

alter table public.v2_subscription_plans
  add column canonical_plan_uuid uuid references public.v2_subscription_plans(plan_uuid),
  add column audience text not null default 'unknown' check (audience in ('individual','team','enterprise','unknown')),
  add column status text not null default 'active' check (status in ('active','retired','merged')),
  add column effective_from timestamptz not null default '-infinity',
  add column source_url text,
  add column verified_at timestamptz;

create unique index v2_subscription_plan_identity_idx on public.v2_subscription_plans(coalesce(lab_slug,''),plan_id) where status <> 'merged';

create trigger subscription_identity before insert on public.v2_subscription_plans for each row execute function public.canonicalize_subscription_identity();

comment on column public.v2_subscription_plans.price is 'Historical legacy price; new pricing belongs to v2_subscription_offer_prices.';
comment on column public.v2_subscription_plans.frequency is 'Historical legacy frequency; new billing periods belong to v2_subscription_plan_offers.';
