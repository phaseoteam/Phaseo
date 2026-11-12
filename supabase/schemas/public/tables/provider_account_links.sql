CREATE TABLE "public"."provider_account_links" (
  "provider_slug" text                     NOT NULL,
  "workspace_id"  uuid                     NOT NULL,
  "linked_by"     uuid,
  "role"          text                     NOT NULL DEFAULT 'owner'::text,
  "status"        text                     NOT NULL DEFAULT 'pending'::text,
  "proof_method"  text                     NOT NULL DEFAULT 'catalog_domain_match'::text,
  "proof_subject" text,
  "verified_at"   timestamp with time zone,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_account_links_linked_by_fkey" FOREIGN KEY (linked_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "provider_account_links_pkey" PRIMARY KEY (provider_slug, workspace_id),
  CONSTRAINT "provider_account_links_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))),
  CONSTRAINT "provider_account_links_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'revoked'::text]))),
  CONSTRAINT "provider_account_links_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE,
  CONSTRAINT "provider_account_links_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."provider_account_links"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX provider_account_links_active_workspace_idx ON public.provider_account_links USING btree (workspace_id)
  WHERE (status = 'active'::text);

CREATE INDEX provider_account_links_linked_by_idx ON public.provider_account_links USING btree (linked_by);

CREATE UNIQUE INDEX provider_account_links_one_active_owner_idx ON public.provider_account_links USING btree (provider_slug)
  WHERE ((status = 'active'::text) AND (ROLE = 'owner'::text));

CREATE POLICY "deny_direct_client_access" ON "public"."provider_account_links"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."provider_account_links" IS 'Provider-to-workspace ownership links. Individual access is inherited from workspace membership.';

REVOKE ALL ON TABLE "public"."provider_account_links" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_account_links" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_account_links" FROM "anon", "authenticated";
