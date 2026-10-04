CREATE TABLE "public"."v2_model_families" (
  "family_slug" text                     NOT NULL,
  "lab_slug"    text                     NOT NULL,
  "name"        text                     NOT NULL,
  "metadata"    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_model_families_lab_slug_family_slug_key" UNIQUE (lab_slug, family_slug),
  CONSTRAINT "v2_model_families_lab_slug_fkey" FOREIGN KEY (lab_slug) REFERENCES public.v2_labs(lab_slug) ON DELETE CASCADE,
  CONSTRAINT "v2_model_families_pkey" PRIMARY KEY (family_slug)
);

ALTER TABLE "public"."v2_model_families"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_families
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE POLICY "v2_model_families_public_select" ON "public"."v2_model_families"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_model_families" TO "anon", "authenticated", "service_role";
