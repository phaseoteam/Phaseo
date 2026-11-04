CREATE TABLE "public"."workspace_guardrail_assignments" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "guardrail_id" uuid                     NOT NULL,
  "target_type"  text                     NOT NULL,
  "target_id"    uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "created_by"   uuid,
  CONSTRAINT "workspace_guardrail_assignments_guardrail_id_fkey" FOREIGN KEY (guardrail_id) REFERENCES public.workspace_guardrails(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_guardrail_assignments_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_guardrail_assignments_target_id_check" CHECK (((target_type = 'workspace'::text) = (target_id IS NULL))),
  CONSTRAINT "workspace_guardrail_assignments_target_type_check" CHECK ((target_type = ANY (ARRAY['workspace'::text, 'department'::text, 'member'::text, 'key'::text]))),
  CONSTRAINT "workspace_guardrail_assignments_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_guardrail_assignments"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_guardrail_assignments_target_idx ON public.workspace_guardrail_assignments USING btree (workspace_id, target_type, target_id);

CREATE UNIQUE INDEX workspace_guardrail_assignments_unique_idx ON public.workspace_guardrail_assignments USING btree (guardrail_id, target_type, COALESCE(target_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_guardrail_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE TRIGGER protect_workspace_baseline_guardrail
  BEFORE INSERT OR DELETE OR UPDATE ON public.workspace_guardrail_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_workspace_baseline_guardrail();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_guardrail_assignments"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_guardrail_assignments" IS 'Where each guardrail applies: the whole workspace (target_id NULL), a department, a member (the principal of their keys, even after they leave) or one key. Key and member rows are copied from key_guardrails and workspace_member_guardrails by private.sync_guardrail_assignments; write those through the legacy tables or apply_guardrail_assignment_change. Workspace and department rows are written here directly. Service role only.';

REVOKE ALL ON TABLE "public"."workspace_guardrail_assignments" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_guardrail_assignments" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_guardrail_assignments" FROM "anon", "authenticated";
