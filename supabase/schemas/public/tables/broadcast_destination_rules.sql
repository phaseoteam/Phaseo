CREATE TABLE "public"."broadcast_destination_rules" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "rule_group_id" uuid                     NOT NULL,
  "field"         text                     NOT NULL,
  "condition"     text                     NOT NULL,
  "value"         text,
  "position"      integer                  NOT NULL DEFAULT 0,
  "created_at"    timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT "broadcast_destination_rules_condition_check"
    CHECK
    ((condition = ANY (ARRAY['equals'::text, 'not_equals'::text, 'contains'::text, 'not_contains'::text, 'starts_with'::text, 'ends_with'::text, 'exists'::text, 'not_exists'::text,
    'matches_regex'::text]))),
  CONSTRAINT "broadcast_destination_rules_field_check"
    CHECK
    ((field = ANY (ARRAY['model'::text, 'provider'::text, 'session_id'::text, 'user_id'::text, 'api_key_name'::text, 'finish_reason'::text, 'input'::text, 'output'::text,
    'token_cost'::text, 'total_cost'::text, 'total_tokens'::text, 'prompt_tokens'::text, 'completion_tokens'::text]))),
  CONSTRAINT "broadcast_destination_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "broadcast_destination_rules_rule_group_id_fkey" FOREIGN KEY (rule_group_id) REFERENCES public.broadcast_destination_rule_groups(id) ON DELETE CASCADE
);

ALTER TABLE "public"."broadcast_destination_rules"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX broadcast_destination_rules_group_id_idx ON public.broadcast_destination_rules USING btree (rule_group_id, "position");

CREATE POLICY "broadcast_destination_rules_delete_own_team" ON "public"."broadcast_destination_rules"
  FOR DELETE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.broadcast_destination_rule_groups g
     JOIN public.workspace_broadcast_destinations d ON ((d.id = g.destination_id)))
  WHERE ((g.id = broadcast_destination_rules.rule_group_id) AND public.is_workspace_admin(d.workspace_id)))));

CREATE POLICY "broadcast_destination_rules_insert_own_team" ON "public"."broadcast_destination_rules"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.broadcast_destination_rule_groups g
     JOIN public.workspace_broadcast_destinations d ON ((d.id = g.destination_id)))
  WHERE ((g.id = broadcast_destination_rules.rule_group_id) AND public.is_workspace_admin(d.workspace_id)))));

CREATE POLICY "broadcast_destination_rules_select_own_team" ON "public"."broadcast_destination_rules"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.broadcast_destination_rule_groups g
     JOIN public.workspace_broadcast_destinations d ON ((d.id = g.destination_id)))
  WHERE ((g.id = broadcast_destination_rules.rule_group_id) AND public.is_workspace_member(d.workspace_id)))));

CREATE POLICY "broadcast_destination_rules_update_own_team" ON "public"."broadcast_destination_rules"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.broadcast_destination_rule_groups g
     JOIN public.workspace_broadcast_destinations d ON ((d.id = g.destination_id)))
  WHERE ((g.id = broadcast_destination_rules.rule_group_id) AND public.is_workspace_admin(d.workspace_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.broadcast_destination_rule_groups g
     JOIN public.workspace_broadcast_destinations d ON ((d.id = g.destination_id)))
  WHERE ((g.id = broadcast_destination_rules.rule_group_id) AND public.is_workspace_admin(d.workspace_id)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."broadcast_destination_rules" TO "anon", "authenticated", "service_role";
