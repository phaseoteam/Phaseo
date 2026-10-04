CREATE TABLE "public"."workspace_member_guardrails" (
  "workspace_id" uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "guardrail_id" uuid                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_member_guardrails_guardrail_id_fkey" FOREIGN KEY (guardrail_id) REFERENCES public.workspace_guardrails(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_member_guardrails_pkey" PRIMARY KEY (workspace_id, user_id, guardrail_id),
  CONSTRAINT "workspace_member_guardrails_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_member_guardrails_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_member_guardrails"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_member_guardrails_guardrail_id_idx ON public.workspace_member_guardrails USING btree (guardrail_id);

CREATE INDEX workspace_member_guardrails_user_id_idx ON public.workspace_member_guardrails USING btree (user_id);

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_member_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE POLICY "workspace_member_guardrails_delete_admin" ON "public"."workspace_member_guardrails"
  FOR DELETE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE
    ((wm.workspace_id = workspace_member_guardrails.workspace_id) AND (wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role,
    'admin'::public.workspace_role]))))));

CREATE POLICY "workspace_member_guardrails_insert_admin" ON "public"."workspace_member_guardrails"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE
    ((wm.workspace_id = workspace_member_guardrails.workspace_id) AND (wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.role = ANY (ARRAY['owner'::public.workspace_role,
    'admin'::public.workspace_role]))))));

CREATE POLICY "workspace_member_guardrails_select_own_workspace" ON "public"."workspace_member_guardrails"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE ((wm.workspace_id = workspace_member_guardrails.workspace_id) AND (wm.user_id = ( SELECT auth.uid() AS uid))))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_member_guardrails" TO "anon", "authenticated", "service_role";
