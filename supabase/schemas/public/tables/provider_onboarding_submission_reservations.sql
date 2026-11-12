CREATE TABLE "public"."provider_onboarding_submission_reservations" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_onboarding_submission_reservations_pkey" PRIMARY KEY (id),
  CONSTRAINT "provider_onboarding_submission_reservations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."provider_onboarding_submission_reservations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX provider_onboarding_submission_reservations_user_idx ON public.provider_onboarding_submission_reservations USING btree (user_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."provider_onboarding_submission_reservations"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."provider_onboarding_submission_reservations" FROM "anon", "authenticated", "service_role";
