CREATE TABLE "public"."workspace_departments" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    uuid                     NOT NULL,
  "name"            text                     NOT NULL,
  "description"     text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "icon"            text                     NOT NULL DEFAULT 'users'::text,
  "color"           text                     NOT NULL DEFAULT 'slate'::text,
  "source_type"     text                     NOT NULL DEFAULT 'manual'::text,
  "source_id"       uuid,
  "directory_name"  text,
  "name_overridden" boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "workspace_departments_color_check"
    CHECK
    ((color = ANY (ARRAY['blue'::text, 'emerald'::text, 'amber'::text, 'rose'::text, 'violet'::text, 'slate'::text, 'cyan'::text, 'teal'::text, 'lime'::text, 'yellow'::text,
    'orange'::text, 'red'::text, 'pink'::text, 'fuchsia'::text, 'indigo'::text, 'sky'::text, 'green'::text, 'purple'::text]))),
  CONSTRAINT "workspace_departments_icon_check"
    CHECK
    ((icon = ANY (ARRAY['users'::text, 'briefcase'::text, 'megaphone'::text, 'code'::text, 'palette'::text, 'headphones'::text, 'landmark'::text, 'scale'::text,
    'heart-pulse'::text,
    'globe'::text, 'flask'::text, 'graduation-cap'::text, 'shield-check'::text, 'shopping-bag'::text, 'wrench'::text, 'truck'::text, 'handshake'::text, 'chart'::text]))),
  CONSTRAINT "workspace_departments_id_workspace_id_key" UNIQUE (id, workspace_id),
  CONSTRAINT "workspace_departments_name_check" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 100))),
  CONSTRAINT "workspace_departments_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_departments_source_check" CHECK ((source_type = ANY (ARRAY['manual'::text, 'scim_group'::text]))),
  CONSTRAINT "workspace_departments_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_departments"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."workspace_departments"
  ADD COLUMN "name_normalized" text GENERATED ALWAYS AS (lower(btrim(name))) STORED;

ALTER TABLE "public"."workspace_departments"
  ADD CONSTRAINT "workspace_departments_workspace_id_name_normalized_key" UNIQUE (workspace_id, name_normalized);

CREATE UNIQUE INDEX workspace_departments_directory_source_idx ON public.workspace_departments USING btree (workspace_id, source_type, source_id)
  WHERE (source_id IS NOT NULL);

CREATE INDEX workspace_departments_workspace_idx ON public.workspace_departments USING btree (workspace_id);

CREATE TRIGGER workspace_departments_reconcile
  AFTER UPDATE OF name ON public.workspace_departments
  FOR EACH ROW
  EXECUTE FUNCTION public.reconcile_scim_entitlements_trigger();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_departments"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_departments" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_departments" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_departments" FROM "anon", "authenticated";
