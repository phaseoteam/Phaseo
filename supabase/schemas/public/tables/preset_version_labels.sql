CREATE TABLE "public"."preset_version_labels" (
  "preset_id"  uuid                     NOT NULL,
  "label"      text                     NOT NULL,
  "version_id" uuid                     NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "preset_version_labels_label_check" CHECK (((label ~ '^[a-z][a-z0-9_-]{0,31}$'::text) AND (label !~ '^v[0-9]+$'::text))),
  CONSTRAINT "preset_version_labels_pkey" PRIMARY KEY (preset_id, label),
  CONSTRAINT "preset_version_labels_preset_id_fkey" FOREIGN KEY (preset_id) REFERENCES public.presets(id) ON DELETE CASCADE,
  CONSTRAINT "preset_version_labels_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.users(user_id) ON DELETE SET NULL,
  CONSTRAINT "preset_version_labels_version_fkey" FOREIGN KEY (preset_id, version_id) REFERENCES public.preset_versions(preset_id, id) ON DELETE CASCADE
);

ALTER TABLE "public"."preset_version_labels"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX preset_version_labels_preset_version_idx ON public.preset_version_labels USING btree (preset_id, version_id);

CREATE INDEX preset_version_labels_updated_by_idx ON public.preset_version_labels USING btree (updated_by);

CREATE POLICY "service_role_full_access" ON "public"."preset_version_labels"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE "public"."preset_version_labels" IS 'Named pointers (such as production or staging) at a published preset version. Requests pin one with prompt.version or model "@slug@label"; moving a label back is a rollback. Labels never look like sequential version labels (v1, v2 and so on).';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."preset_version_labels" TO "service_role";

REVOKE ALL ON TABLE "public"."preset_version_labels" FROM "anon", "authenticated";
