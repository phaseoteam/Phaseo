CREATE TABLE "public"."resend_contact_identities" (
  "user_id"    uuid                     NOT NULL,
  "email"      text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "resend_contact_identities_email_check" CHECK (((email = lower(btrim(email))) AND (POSITION(('@'::text) IN (email)) > 1))),
  CONSTRAINT "resend_contact_identities_pkey" PRIMARY KEY (user_id, email),
  CONSTRAINT "resend_contact_identities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."resend_contact_identities"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."resend_contact_identities"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."resend_contact_identities" IS 'Prior verified sign-in addresses retained only so account deletion can remove every corresponding Resend contact.';

REVOKE ALL ON TABLE "public"."resend_contact_identities" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."resend_contact_identities" TO "service_role";

REVOKE ALL ON TABLE "public"."resend_contact_identities" FROM "anon", "authenticated";
