CREATE TABLE "public"."provider_claim_challenges" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug" text                     NOT NULL,
  "requested_by"  uuid                     NOT NULL,
  "domain"        text                     NOT NULL,
  "token_hash"    text                     NOT NULL,
  "status"        text                     NOT NULL DEFAULT 'pending'::text,
  "expires_at"    timestamp with time zone NOT NULL DEFAULT (now() + '01:00:00'::interval),
  "verified_at"   timestamp with time zone,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_claim_challenges_pkey" PRIMARY KEY (id),
  CONSTRAINT "provider_claim_challenges_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "provider_claim_challenges_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'expired'::text, 'cancelled'::text]))),
  CONSTRAINT "provider_claim_challenges_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."provider_claim_challenges"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX provider_claim_challenges_provider_slug_idx ON public.provider_claim_challenges USING btree (provider_slug);

CREATE INDEX provider_claim_challenges_request_idx ON public.provider_claim_challenges USING btree (requested_by, provider_slug, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."provider_claim_challenges"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."provider_claim_challenges" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_claim_challenges" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_claim_challenges" FROM "anon", "authenticated";
