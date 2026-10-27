CREATE TABLE "public"."workspace_spend_rule_destinations" (
  "rule_id"        uuid                     NOT NULL,
  "destination_id" uuid                     NOT NULL,
  "workspace_id"   uuid                     NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_spend_rule_destinations_destination_fkey" FOREIGN KEY (destination_id, workspace_id) REFERENCES public.notification_destinations(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_spend_rule_destinations_pkey" PRIMARY KEY (rule_id, destination_id),
  CONSTRAINT "workspace_spend_rule_destinations_rule_fkey" FOREIGN KEY (rule_id, workspace_id) REFERENCES public.workspace_spend_rules(id, workspace_id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_rule_destinations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_spend_rule_destinations_destination_idx ON public.workspace_spend_rule_destinations USING btree (destination_id, workspace_id);

CREATE INDEX workspace_spend_rule_destinations_workspace_idx ON public.workspace_spend_rule_destinations USING btree (workspace_id);

CREATE POLICY "workspace_spend_rule_destinations_select_member" ON "public"."workspace_spend_rule_destinations"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

COMMENT ON TABLE "public"."workspace_spend_rule_destinations" IS 'Where a spend rule''s alerts go. When a rule has rows here they replace the workspace''s spend_alert / spend_blocked routes for that rule; with none, the routes apply. Both ids must be in the same workspace. Destinations that are not active are skipped at delivery.';

REVOKE ALL ON TABLE "public"."workspace_spend_rule_destinations" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_rule_destinations" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_rule_destinations" FROM "anon", "authenticated";

GRANT SELECT ON TABLE "public"."workspace_spend_rule_destinations" TO "authenticated";
