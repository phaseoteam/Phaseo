CREATE TABLE "public"."credit_grants" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "code"              text                     NOT NULL,
  "code_normalized"   text                     NOT NULL,
  "amount_nanos"      bigint                   NOT NULL,
  "max_redemptions"   integer                  NOT NULL,
  "redemptions_count" integer                  NOT NULL DEFAULT 0,
  "expires_at"        timestamp with time zone,
  "is_active"         boolean                  NOT NULL DEFAULT true,
  "created_by"        uuid,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "disabled_at"       timestamp with time zone,
  "note"              text,
  CONSTRAINT "credit_grants_amount_nanos_check" CHECK ((amount_nanos > 0)),
  CONSTRAINT "credit_grants_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "credit_grants_max_redemptions_check" CHECK ((max_redemptions > 0)),
  CONSTRAINT "credit_grants_pkey" PRIMARY KEY (id),
  CONSTRAINT "credit_grants_redemption_bounds" CHECK ((redemptions_count <= max_redemptions)),
  CONSTRAINT "credit_grants_redemptions_count_check" CHECK ((redemptions_count >= 0))
);

ALTER TABLE "public"."credit_grants"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX credit_grants_active_expiry_idx ON public.credit_grants USING btree (is_active, expires_at, code_normalized);

CREATE UNIQUE INDEX credit_grants_code_normalized_key ON public.credit_grants USING btree (code_normalized);

CREATE INDEX credit_grants_created_by_idx ON public.credit_grants USING btree (created_by);

CREATE POLICY "credit_grants_admin_all" ON "public"."credit_grants"
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.is_admin_user() AS is_admin_user))
  WITH CHECK (( SELECT public.is_admin_user() AS is_admin_user));

CREATE POLICY "credit_grants_service_all" ON "public"."credit_grants"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."credit_grants" TO "anon", "authenticated", "service_role";
