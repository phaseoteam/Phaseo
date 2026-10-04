CREATE TABLE "public"."v2_model_details" (
  "model_slug"   text                     NOT NULL,
  "detail_name"  text                     NOT NULL,
  "detail_value" jsonb                    NOT NULL DEFAULT 'null'::jsonb,
  "detail_order" integer                  NOT NULL DEFAULT 100,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_model_details_pkey" PRIMARY KEY (model_slug, detail_name),
  CONSTRAINT "v2_model_details_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_model_details"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_details
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_model_details"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING (public.catalog_model_is_public(model_slug));

CREATE POLICY "v2_model_details_public_select" ON "public"."v2_model_details"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_model_details" TO "anon", "authenticated", "service_role";
