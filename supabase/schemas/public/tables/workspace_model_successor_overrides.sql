CREATE TABLE "public"."workspace_model_successor_overrides" (
  "workspace_id"         uuid                     NOT NULL,
  "model_slug"           text                     NOT NULL,
  "successor_model_slug" text,
  "created_by"           uuid,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_model_successor_overrides_not_self_check"
    CHECK (((successor_model_slug IS NULL) OR (successor_model_slug <> model_slug))),
  CONSTRAINT "workspace_model_successor_overrides_pkey" PRIMARY KEY (workspace_id, model_slug),
  CONSTRAINT "workspace_model_successor_overrides_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_model_successor_overrides_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE,
  CONSTRAINT "workspace_model_successor_overrides_successor_model_slug_fkey"
    FOREIGN KEY (successor_model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE,
  CONSTRAINT "workspace_model_successor_overrides_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_model_successor_overrides"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON "public"."workspace_model_successor_overrides"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE "public"."workspace_model_successor_overrides" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_model_successor_overrides" TO "service_role";

COMMENT ON TABLE "public"."workspace_model_successor_overrides" IS 'Per-workspace replacement for a model no provider serves any more. A null successor_model_slug means never redirect that model for the workspace.';

REVOKE ALL ON TABLE "public"."workspace_model_successor_overrides" FROM "anon", "authenticated";
