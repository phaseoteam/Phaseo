CREATE TABLE "public"."keys" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"             uuid                     NOT NULL,
  "name"                     text                     NOT NULL,
  "hash"                     text                     NOT NULL,
  "prefix"                   text                     NOT NULL,
  "status"                   text                     NOT NULL DEFAULT 'active'::text,
  "scopes"                   text                     NOT NULL,
  "created_at"               timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "last_used_at"             timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text),
  "kid"                      text,
  "soft_blocked"             boolean                  NOT NULL DEFAULT false,
  "daily_limit_requests"     bigint                   NOT NULL DEFAULT 0,
  "weekly_limit_requests"    bigint                   NOT NULL DEFAULT 0,
  "monthly_limit_requests"   bigint                   NOT NULL DEFAULT 0,
  "daily_limit_cost_nanos"   bigint                   NOT NULL DEFAULT 0,
  "weekly_limit_cost_nanos"  bigint                   NOT NULL DEFAULT 0,
  "monthly_limit_cost_nanos" bigint                   NOT NULL DEFAULT 0,
  "expires_at"               timestamp with time zone,
  "revoked_at"               timestamp with time zone,
  "revoked_reason"           text,
  "key_kind"                 text                     NOT NULL DEFAULT 'standard'::text,
  "oauth_client_id"          text,
  "oauth_user_id"            uuid,
  "oauth_scopes"             text[],
  "issued_via"               text                     NOT NULL DEFAULT 'dashboard'::text,
  "oauth_resource"           text,
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "ip_allowlist"             jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT "keys_active_oauth_delegated_gateway_scope_check"
    CHECK (((key_kind <> 'oauth_delegated'::text) OR (status <> 'active'::text) OR ((NULLIF(btrim(oauth_resource), ''::text) IS
    NOT NULL) AND (NOT COALESCE((btrim(oauth_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$'::text), false))) OR
    (COALESCE(oauth_scopes, ARRAY[]::text[]) @> ARRAY['gateway:access'::text]))),
  CONSTRAINT "keys_hash_key" UNIQUE (hash),
  CONSTRAINT "keys_issued_via_check" CHECK ((issued_via = ANY (ARRAY['dashboard'::text, 'oauth_pkce'::text, 'cli'::text]))),
  CONSTRAINT "keys_key_kind_check" CHECK ((key_kind = ANY (ARRAY['standard'::text, 'oauth_delegated'::text]))),
  CONSTRAINT "keys_oauth_user_id_fkey" FOREIGN KEY (oauth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "keys_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
  "created_by"               uuid                     NOT NULL DEFAULT auth.uid(),
  CONSTRAINT "keys_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE CASCADE,
  CONSTRAINT "keys_ip_allowlist_valid" CHECK (public.valid_key_ip_allowlist(ip_allowlist))
);

ALTER TABLE "public"."keys"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX keys_expires_at_idx ON public.keys USING btree (expires_at)
  WHERE (expires_at IS NOT NULL);

CREATE UNIQUE INDEX keys_kid_uidx ON public.keys USING btree (kid);

CREATE UNIQUE INDEX keys_oauth_delegated_active_idx ON public.keys USING btree (oauth_user_id, workspace_id, oauth_client_id)
  WHERE ((key_kind = 'oauth_delegated'::text) AND (status = 'active'::text));

CREATE INDEX keys_workspace_id_idx ON public.keys USING btree (workspace_id)
  WHERE (workspace_id IS NOT NULL);

CREATE TRIGGER keys_set_updated_at
  BEFORE UPDATE ON public.keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_key_updated_at();

CREATE POLICY "keys_delete_own_team" ON "public"."keys"
  FOR DELETE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "keys_insert_own_team" ON "public"."keys"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "keys_select_own_team" ON "public"."keys"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "keys_update_own_team" ON "public"."keys"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."keys" TO "anon", "authenticated", "service_role";

CREATE INDEX keys_created_by_idx ON public.keys USING btree (created_by)
  WHERE (created_by IS NOT NULL);

COMMENT ON COLUMN "public"."keys"."ip_allowlist" IS 'Labeled IPv4/IPv6 addresses or CIDRs allowed to use this key. Empty permits any IP.';
