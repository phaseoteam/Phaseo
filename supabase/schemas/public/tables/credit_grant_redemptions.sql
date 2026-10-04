CREATE TABLE "public"."credit_grant_redemptions" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "grant_id"     uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "amount_nanos" bigint                   NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "credit_grant_redemptions_amount_nanos_check" CHECK ((amount_nanos > 0)),
  CONSTRAINT "credit_grant_redemptions_grant_user_unique" UNIQUE (grant_id, user_id),
  CONSTRAINT "credit_grant_redemptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "credit_grant_redemptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "credit_grant_redemptions_grant_id_fkey" FOREIGN KEY (grant_id) REFERENCES public.credit_grants(id) ON DELETE CASCADE,
  CONSTRAINT "credit_grant_redemptions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."credit_grant_redemptions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX credit_grant_redemptions_user_created_idx ON public.credit_grant_redemptions USING btree (user_id, created_at DESC);

CREATE INDEX credit_grant_redemptions_workspace_created_idx ON public.credit_grant_redemptions USING btree (workspace_id, created_at DESC);

CREATE POLICY "credit_grant_redemptions_admin_all" ON "public"."credit_grant_redemptions"
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.is_admin_user() AS is_admin_user))
  WITH CHECK (( SELECT public.is_admin_user() AS is_admin_user));

CREATE POLICY "credit_grant_redemptions_service_all" ON "public"."credit_grant_redemptions"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."credit_grant_redemptions" TO "anon", "authenticated", "service_role";
