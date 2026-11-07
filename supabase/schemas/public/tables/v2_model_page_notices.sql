CREATE TABLE "public"."v2_model_page_notices" (
  "model_slug" text                     NOT NULL,
  "tone"       text                     NOT NULL,
  "markdown"   text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_model_page_notices_pkey" PRIMARY KEY (model_slug),
  CONSTRAINT "v2_model_page_notices_tone_check" CHECK ((tone = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text]))),
  CONSTRAINT "v2_model_page_notices_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_model_page_notices"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_page_notices
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_model_page_notices"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING (public.catalog_model_is_public(model_slug));

CREATE POLICY "v2_model_page_notices_public_select" ON "public"."v2_model_page_notices"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_model_page_notices" TO "anon", "authenticated", "service_role";
