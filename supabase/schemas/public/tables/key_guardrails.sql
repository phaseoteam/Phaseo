CREATE TABLE "public"."key_guardrails" (
  "key_id"       uuid                     NOT NULL,
  "guardrail_id" uuid                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT "key_guardrails_pkey" PRIMARY KEY (key_id, guardrail_id),
  CONSTRAINT "key_guardrails_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE CASCADE,
  CONSTRAINT "key_guardrails_guardrail_id_fkey" FOREIGN KEY (guardrail_id) REFERENCES public.workspace_guardrails(id) ON DELETE CASCADE
);

ALTER TABLE "public"."key_guardrails"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX key_guardrails_guardrail_id_idx ON public.key_guardrails USING btree (guardrail_id);

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.key_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE POLICY "key_guardrails_delete_own_team" ON "public"."key_guardrails"
  FOR DELETE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.keys k
     JOIN public.workspace_guardrails g ON ((g.id = key_guardrails.guardrail_id)))
  WHERE ((k.id = key_guardrails.key_id) AND (k.workspace_id = g.workspace_id) AND public.is_workspace_admin(k.workspace_id)))));

CREATE POLICY "key_guardrails_insert_own_team" ON "public"."key_guardrails"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.keys k
     JOIN public.workspace_guardrails g ON ((g.id = key_guardrails.guardrail_id)))
  WHERE ((k.id = key_guardrails.key_id) AND (k.workspace_id = g.workspace_id) AND public.is_workspace_admin(k.workspace_id)))));

CREATE POLICY "key_guardrails_select_own_team" ON "public"."key_guardrails"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.keys k
  WHERE ((k.id = key_guardrails.key_id) AND public.is_workspace_member(k.workspace_id)))));

CREATE POLICY "key_guardrails_update_own_team" ON "public"."key_guardrails"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.keys k
     JOIN public.workspace_guardrails g ON ((g.id = key_guardrails.guardrail_id)))
  WHERE ((k.id = key_guardrails.key_id) AND (k.workspace_id = g.workspace_id) AND public.is_workspace_admin(k.workspace_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.keys k
     JOIN public.workspace_guardrails g ON ((g.id = key_guardrails.guardrail_id)))
  WHERE ((k.id = key_guardrails.key_id) AND (k.workspace_id = g.workspace_id) AND public.is_workspace_admin(k.workspace_id)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."key_guardrails" TO "anon", "authenticated", "service_role";
