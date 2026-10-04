CREATE TABLE "public"."broadcast_destination_rule_groups" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "destination_id" uuid                     NOT NULL,
  "name"           text                     NOT NULL,
  "match_operator" text                     NOT NULL DEFAULT 'and'::text,
  "position"       integer                  NOT NULL DEFAULT 0,
  "created_at"     timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT "broadcast_destination_rule_groups_match_operator_check" CHECK ((match_operator = ANY (ARRAY['and'::text, 'or'::text]))),
  CONSTRAINT "broadcast_destination_rule_groups_pkey" PRIMARY KEY (id),
  CONSTRAINT "broadcast_destination_rule_groups_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES public.workspace_broadcast_destinations(id) ON DELETE CASCADE
);

ALTER TABLE "public"."broadcast_destination_rule_groups"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX broadcast_destination_rule_groups_destination_id_idx ON public.broadcast_destination_rule_groups USING btree (destination_id, "position");

CREATE POLICY "broadcast_destination_rule_groups_delete_own_team" ON "public"."broadcast_destination_rule_groups"
  FOR DELETE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_broadcast_destinations d
  WHERE ((d.id = broadcast_destination_rule_groups.destination_id) AND public.is_workspace_admin(d.workspace_id)))));

CREATE POLICY "broadcast_destination_rule_groups_insert_own_team" ON "public"."broadcast_destination_rule_groups"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspace_broadcast_destinations d
  WHERE ((d.id = broadcast_destination_rule_groups.destination_id) AND public.is_workspace_admin(d.workspace_id)))));

CREATE POLICY "broadcast_destination_rule_groups_select_own_team" ON "public"."broadcast_destination_rule_groups"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_broadcast_destinations d
  WHERE ((d.id = broadcast_destination_rule_groups.destination_id) AND public.is_workspace_member(d.workspace_id)))));

CREATE POLICY "broadcast_destination_rule_groups_update_own_team" ON "public"."broadcast_destination_rule_groups"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_broadcast_destinations d
  WHERE ((d.id = broadcast_destination_rule_groups.destination_id) AND public.is_workspace_admin(d.workspace_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspace_broadcast_destinations d
  WHERE ((d.id = broadcast_destination_rule_groups.destination_id) AND public.is_workspace_admin(d.workspace_id)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."broadcast_destination_rule_groups" TO "anon", "authenticated", "service_role";
