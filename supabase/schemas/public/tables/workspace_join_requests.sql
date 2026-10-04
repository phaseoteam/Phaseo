CREATE TABLE "public"."workspace_join_requests" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "invite_id"         uuid,
  "requester_user_id" uuid                     NOT NULL,
  "decided_by"        uuid,
  "decided_at"        timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_join_requests_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES public.users(user_id) ON DELETE SET NULL,
  CONSTRAINT "workspace_join_requests_invite_id_fkey" FOREIGN KEY (invite_id) REFERENCES public.workspace_invites(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_join_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_join_requests_requester_user_id_fkey" FOREIGN KEY (requester_user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_join_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_join_requests"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."workspace_join_requests"
  ADD COLUMN "status" public.join_request_status NOT NULL DEFAULT 'pending'::public.join_request_status;

CREATE INDEX workspace_join_requests_decided_by_idx ON public.workspace_join_requests USING btree (decided_by);

CREATE INDEX workspace_join_requests_invite_id_idx ON public.workspace_join_requests USING btree (invite_id);

CREATE INDEX workspace_join_requests_pending_idx ON public.workspace_join_requests USING btree (status)
  WHERE (status = 'pending'::public.join_request_status);

CREATE UNIQUE INDEX workspace_join_requests_pending_unique ON public.workspace_join_requests USING btree (workspace_id, requester_user_id)
  WHERE (status = 'pending'::public.join_request_status);

CREATE INDEX workspace_join_requests_requester_idx ON public.workspace_join_requests USING btree (requester_user_id);

CREATE INDEX workspace_join_requests_workspace_idx ON public.workspace_join_requests USING btree (workspace_id);

CREATE TRIGGER workspace_join_requests_write_rules_guard
  BEFORE INSERT OR UPDATE ON public.workspace_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workspace_join_request_write_rules();

CREATE POLICY "join_requests: delete by owner" ON "public"."workspace_join_requests"
  FOR DELETE
  TO "authenticated"
  USING (public.is_team_owner(workspace_id));

CREATE POLICY "team_join_requests_insert" ON "public"."workspace_join_requests"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((requester_user_id = ( SELECT auth.uid() AS uid)) AND (invite_id IS
    NOT NULL) AND (status = 'pending'::public.join_request_status) AND (decided_by IS NULL) AND (decided_at IS NULL) AND (NOT public.is_workspace_member(workspace_id)) AND
    public.is_active_invite_for_workspace(invite_id, workspace_id)));

CREATE POLICY "team_join_requests_select" ON "public"."workspace_join_requests"
  FOR SELECT
  TO "authenticated"
  USING ((public.is_workspace_member(workspace_id) OR (requester_user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "team_join_requests_update" ON "public"."workspace_join_requests"
  FOR UPDATE
  TO "authenticated"
  USING ((public.is_workspace_admin(workspace_id) AND (status = 'pending'::public.join_request_status)))
  WITH
    CHECK
    ((public.is_workspace_admin(workspace_id) AND (status = ANY (ARRAY['approved'::public.join_request_status, 'denied'::public.join_request_status])) AND (decided_by = ( SELECT
    auth.uid() AS uid)) AND (decided_at IS NOT NULL)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_join_requests" TO "anon", "authenticated", "service_role";
