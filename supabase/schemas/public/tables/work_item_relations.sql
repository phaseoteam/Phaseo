CREATE TABLE "public"."work_item_relations" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    uuid                     NOT NULL,
  "item_id"         uuid                     NOT NULL,
  "related_item_id" uuid                     NOT NULL,
  "kind"            text                     NOT NULL,
  "created_by"      uuid,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_item_relations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_item_relations_distinct_check" CHECK ((item_id <> related_item_id)),
  CONSTRAINT "work_item_relations_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_item_relations_kind_check" CHECK ((kind = ANY (ARRAY['blocks'::text, 'related'::text]))),
  CONSTRAINT "work_item_relations_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_item_relations_related_item_id_fkey" FOREIGN KEY (related_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_item_relations_unique_key" UNIQUE (item_id, related_item_id, kind),
  CONSTRAINT "work_item_relations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_item_relations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_item_relations_created_by_idx ON public.work_item_relations USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX work_item_relations_related_item_id_idx ON public.work_item_relations USING btree (related_item_id);

CREATE INDEX work_item_relations_workspace_id_idx ON public.work_item_relations USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."work_item_relations"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_item_relations" IS 'Links between work items: item_id blocks related_item_id, or the two are related (stored once, read both ways).';

REVOKE ALL ON TABLE "public"."work_item_relations" FROM "service_role";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."work_item_relations" TO "service_role";

REVOKE ALL ON TABLE "public"."work_item_relations" FROM "anon", "authenticated";
