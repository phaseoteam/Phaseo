CREATE TABLE "public"."v2_model_links" (
  "model_slug" text                     NOT NULL,
  "link_kind"  text                     NOT NULL,
  "title"      text                     NOT NULL,
  "url"        text                     NOT NULL,
  "metadata"   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_model_links_pkey" PRIMARY KEY (model_slug, link_kind, url),
  CONSTRAINT "v2_model_links_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_model_links"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_links
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_model_links"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING (public.catalog_model_is_public(model_slug));

CREATE POLICY "v2_model_links_public_select" ON "public"."v2_model_links"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_model_links" TO "anon", "authenticated", "service_role";
