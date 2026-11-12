CREATE TABLE "public"."v2_lab_links" (
  "lab_slug"   text                     NOT NULL,
  "platform"   text                     NOT NULL,
  "url"        text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_lab_links_pkey" PRIMARY KEY (lab_slug, platform, url),
  CONSTRAINT "v2_lab_links_lab_slug_fkey" FOREIGN KEY (lab_slug) REFERENCES public.v2_labs(lab_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_lab_links"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_lab_links
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE POLICY "v2_lab_links_public_select" ON "public"."v2_lab_links"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_lab_links" TO "anon", "authenticated", "service_role";
