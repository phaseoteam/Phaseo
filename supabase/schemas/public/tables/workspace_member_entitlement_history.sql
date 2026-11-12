CREATE TABLE "public"."workspace_member_entitlement_history" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "user_id"             uuid                     NOT NULL,
  "access_role"         text                     NOT NULL,
  "department_id"       uuid,
  "department_name"     text,
  "department_color"    text,
  "department_icon"     text,
  "department_position" text,
  "access_source"       text                     NOT NULL,
  "department_source"   text                     NOT NULL,
  "effective_from"      timestamp with time zone NOT NULL DEFAULT now(),
  "effective_to"        timestamp with time zone,
  "changed_by"          uuid,
  "change_reason"       text                     NOT NULL DEFAULT 'reconcile'::text,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_member_entitlement_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_member_entitlement_history_check" CHECK (((effective_to IS NULL) OR (effective_to > effective_from))),
  CONSTRAINT "workspace_member_entitlement_history_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_member_entitlement_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_member_entitlement_history_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_member_entitlement_history"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_member_entitlement_history_changed_by_idx ON public.workspace_member_entitlement_history USING btree (changed_by);

CREATE UNIQUE INDEX workspace_member_entitlement_history_current_idx ON public.workspace_member_entitlement_history USING btree (workspace_id, user_id)
  WHERE (effective_to IS NULL);

CREATE INDEX workspace_member_entitlement_history_period_idx ON public.workspace_member_entitlement_history USING btree (workspace_id, effective_from, effective_to);

CREATE INDEX workspace_member_entitlement_history_user_id_idx ON public.workspace_member_entitlement_history USING btree (user_id);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_member_entitlement_history"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_member_entitlement_history" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."workspace_member_entitlement_history" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_member_entitlement_history" FROM "anon", "authenticated";
