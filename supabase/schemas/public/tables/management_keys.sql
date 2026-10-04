CREATE TABLE "public"."management_keys" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"             uuid                     NOT NULL,
  "name"                     text                     NOT NULL,
  "hash"                     text                     NOT NULL,
  "prefix"                   text                     NOT NULL,
  "status"                   text                     NOT NULL DEFAULT 'active'::text,
  "scopes"                   text                     NOT NULL,
  "created_by"               uuid,
  "created_at"               timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "last_used_at"             timestamp with time zone,
  "kid"                      text,
  "soft_blocked"             boolean                  NOT NULL DEFAULT false,
  "revoked_at"               timestamp with time zone,
  "revoked_reason"           text,
  "expires_at"               timestamp with time zone,
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "daily_limit_requests"     bigint                   NOT NULL DEFAULT 0,
  "weekly_limit_requests"    bigint                   NOT NULL DEFAULT 0,
  "monthly_limit_requests"   bigint                   NOT NULL DEFAULT 0,
  "daily_limit_cost_nanos"   bigint                   NOT NULL DEFAULT 0,
  "weekly_limit_cost_nanos"  bigint                   NOT NULL DEFAULT 0,
  "monthly_limit_cost_nanos" bigint                   NOT NULL DEFAULT 0,
  CONSTRAINT "management_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "provisioning_keys_hash_key" UNIQUE (hash),
  CONSTRAINT "management_keys_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL,
  CONSTRAINT "management_keys_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."management_keys"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX management_keys_created_by_idx ON public.management_keys USING btree (created_by);

CREATE INDEX management_keys_expires_at_idx ON public.management_keys USING btree (expires_at)
  WHERE (expires_at IS NOT NULL);

CREATE INDEX management_keys_prefix_idx ON public.management_keys USING btree (prefix);

CREATE INDEX management_keys_workspace_id_idx ON public.management_keys USING btree (workspace_id);

CREATE TRIGGER management_keys_set_updated_at
  BEFORE UPDATE ON public.management_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_management_key_updated_at();

CREATE POLICY "management_keys_delete_own_team" ON "public"."management_keys"
  FOR DELETE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "management_keys_insert_own_team" ON "public"."management_keys"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "management_keys_select_own_team" ON "public"."management_keys"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "management_keys_update_own_team" ON "public"."management_keys"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."management_keys" TO "anon", "authenticated", "service_role";
