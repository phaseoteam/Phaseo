CREATE TABLE "public"."workspace_broadcast_destination_limits" (
  "workspace_id"              uuid                     NOT NULL,
  "max_destinations_per_type" integer                  NOT NULL,
  "reason"                    text,
  "set_by"                    uuid,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_broadcast_destination_limits_max_destinations_per_type_check" CHECK (((max_destinations_per_type > 0) AND (max_destinations_per_type <= 1000))),
  CONSTRAINT "workspace_broadcast_destination_limits_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "workspace_broadcast_destination_limits_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_broadcast_destination_limits"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER workspace_broadcast_destination_limits_set_updated_at
  BEFORE UPDATE ON public.workspace_broadcast_destination_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_broadcast_destination_limits"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_broadcast_destination_limits" IS 'Operator-managed override for how many Broadcast destinations of one type a workspace may create. Without a row the default of 5 applies. Manage as service_role.';

REVOKE ALL ON TABLE "public"."workspace_broadcast_destination_limits" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_broadcast_destination_limits" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_broadcast_destination_limits" FROM "anon", "authenticated";
