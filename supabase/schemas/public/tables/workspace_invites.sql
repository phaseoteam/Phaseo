CREATE TABLE "public"."workspace_invites" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "creator_user_id"   uuid                     NOT NULL,
  "expires_at"        timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "max_uses"          integer,
  "uses_count"        integer                  NOT NULL DEFAULT 0,
  "token_encrypted"   text                     NOT NULL DEFAULT ''::text,
  "token_preview"     text,
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "token_fingerprint" text,
  "key_version"       smallint                 NOT NULL DEFAULT 1,
  CONSTRAINT "workspace_invites_inviter_user_id_fkey" FOREIGN KEY (creator_user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_invites_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_invites_preview_len_ck" CHECK (((token_preview IS NULL) OR ((char_length(token_preview) >= 1) AND (char_length(token_preview) <= 12)))),
  CONSTRAINT "workspace_invites_uses_ck" CHECK (((max_uses IS NULL) OR (uses_count <= max_uses))),
  CONSTRAINT "workspace_invites_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_invites"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."workspace_invites"
  ADD COLUMN "role" public.workspace_role NOT NULL DEFAULT 'member'::public.workspace_role;

CREATE UNIQUE INDEX uq_workspace_invites_token_fingerprint ON public.workspace_invites USING btree (token_fingerprint);

CREATE INDEX workspace_invites_active_idx ON public.workspace_invites USING btree (workspace_id, expires_at);

CREATE INDEX workspace_invites_inviter_user_id_idx ON public.workspace_invites USING btree (creator_user_id);

CREATE INDEX workspace_invites_preview_idx ON public.workspace_invites USING btree (token_preview);

CREATE TRIGGER workspace_invites_role_policy_guard
  BEFORE INSERT OR UPDATE ON public.workspace_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workspace_invite_role_policy();

CREATE POLICY "team_invites_delete_own_team" ON "public"."workspace_invites"
  FOR DELETE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "team_invites_insert_own_team" ON "public"."workspace_invites"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.is_workspace_admin(workspace_id) AND (role = ANY (ARRAY['admin'::public.workspace_role, 'member'::public.workspace_role]))));

CREATE POLICY "team_invites_select_own_team" ON "public"."workspace_invites"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "team_invites_update_own_team" ON "public"."workspace_invites"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK ((public.is_workspace_admin(workspace_id) AND (role = ANY (ARRAY['admin'::public.workspace_role, 'member'::public.workspace_role]))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_invites" TO "anon", "authenticated", "service_role";
