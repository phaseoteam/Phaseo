CREATE TABLE "public"."workspace_classifiers" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    uuid                     NOT NULL,
  "slug"            text                     NOT NULL,
  "name"            text                     NOT NULL,
  "description"     text,
  "kind"            text                     NOT NULL DEFAULT 'custom'::text,
  "instructions"    text                     NOT NULL,
  "categories"      jsonb                    NOT NULL,
  "model"           text                     NOT NULL DEFAULT 'gpt-5-mini'::text,
  "service_tier"    text                     NOT NULL DEFAULT 'flex'::text,
  "sample_rate_bps" integer                  NOT NULL DEFAULT 10000,
  "enabled"         boolean                  NOT NULL DEFAULT true,
  "created_by"      uuid,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_classifiers_categories_object_check" CHECK ((jsonb_typeof(categories) = 'object'::text)),
  CONSTRAINT "workspace_classifiers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_classifiers_kind_check" CHECK ((kind = ANY (ARRAY['phaseo_task'::text, 'custom'::text]))),
  CONSTRAINT "workspace_classifiers_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_classifiers_sample_rate_bps_check" CHECK (((sample_rate_bps >= 0) AND (sample_rate_bps <= 10000))),
  CONSTRAINT "workspace_classifiers_service_tier_check" CHECK ((service_tier = ANY (ARRAY['standard'::text, 'flex'::text]))),
  CONSTRAINT "workspace_classifiers_workspace_id_slug_key" UNIQUE (workspace_id, slug),
  CONSTRAINT "workspace_classifiers_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_classifiers"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_classifiers_created_by_idx ON public.workspace_classifiers USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX workspace_classifiers_workspace_enabled_idx ON public.workspace_classifiers USING btree (workspace_id, enabled, created_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."workspace_classifiers"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_classifiers" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_classifiers" FROM "anon", "authenticated";
