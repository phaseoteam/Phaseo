CREATE TABLE "public"."v2_models" (
  "model_slug"             text                     NOT NULL,
  "lab_slug"               text                     NOT NULL,
  "name"                   text                     NOT NULL,
  "description"            text,
  "status"                 text                     NOT NULL DEFAULT 'active'::text,
  "hidden"                 boolean                  NOT NULL DEFAULT false,
  "input_modalities"       text[]                   NOT NULL DEFAULT '{}'::text[],
  "output_modalities"      text[]                   NOT NULL DEFAULT '{}'::text[],
  "family_slug"            text,
  "announced_at"           timestamp with time zone,
  "released_at"            timestamp with time zone,
  "deprecated_at"          timestamp with time zone,
  "retired_at"             timestamp with time zone,
  "metadata"               jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "license"                text,
  "license_url"            text,
  "previous_model_slug"    text,
  "removal_date"           timestamp with time zone,
  "replacement_model_slug" text,
  "variant_kind"           text                     NOT NULL DEFAULT 'standard'::text,
  "base_model_slug"        text,
  "catalogue_status"       text                     NOT NULL DEFAULT 'unknown'::text,
  CONSTRAINT "v2_models_catalogue_status_check"
    CHECK
    ((catalogue_status = ANY (ARRAY['unknown'::text, 'rumoured'::text, 'announced'::text, 'preview'::text, 'available'::text, 'limited_access'::text, 'deprecated'::text,
    'retired'::text, 'withheld'::text]))),
  CONSTRAINT "v2_models_lab_slug_fkey" FOREIGN KEY (lab_slug) REFERENCES public.v2_labs(lab_slug) ON DELETE RESTRICT,
  CONSTRAINT "v2_models_lab_slug_prefix_check" CHECK (((split_part(model_slug, '/'::text, 1) = lab_slug) AND (split_part(model_slug, '/'::text, 2) <> ''::text))),
  CONSTRAINT "v2_models_pkey" PRIMARY KEY (model_slug),
  CONSTRAINT "v2_models_base_model_slug_fkey" FOREIGN KEY (base_model_slug) REFERENCES public.v2_models(model_slug) ON DELETE RESTRICT,
  CONSTRAINT "v2_models_slug_check" CHECK (((model_slug = lower(model_slug)) AND (model_slug ~ '^[a-z0-9][a-z0-9._:/+@-]*$'::text))),
  CONSTRAINT "v2_models_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deprecated'::text, 'retired'::text, 'disabled'::text]))),
  CONSTRAINT "v2_models_variant_identity_check"
    CHECK
    ((((variant_kind = 'standard'::text) AND (model_slug !~ ':free$'::text) AND (base_model_slug IS NULL)) OR ((variant_kind = 'free'::text) AND (model_slug ~ ':free$'::text) AND
    ((base_model_slug IS NULL) OR (base_model_slug <> model_slug))))),
  CONSTRAINT "v2_models_variant_kind_check" CHECK ((variant_kind = ANY (ARRAY['standard'::text, 'free'::text])))
);

ALTER TABLE "public"."v2_models"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_models_catalogue_status_idx ON public.v2_models USING btree (catalogue_status, hidden, model_slug);

CREATE INDEX v2_models_input_modalities_idx ON public.v2_models USING gin (input_modalities);

CREATE INDEX v2_models_lab_idx ON public.v2_models USING btree (lab_slug);

CREATE INDEX v2_models_license_idx ON public.v2_models USING btree (license)
  WHERE (license IS NOT NULL);

CREATE UNIQUE INDEX v2_models_one_free_variant_per_base_idx ON public.v2_models USING btree (base_model_slug)
  WHERE (variant_kind = 'free'::text);

CREATE INDEX v2_models_output_modalities_idx ON public.v2_models USING gin (output_modalities);

CREATE INDEX v2_models_previous_idx ON public.v2_models USING btree (previous_model_slug)
  WHERE (previous_model_slug IS NOT NULL);

CREATE INDEX v2_models_status_idx ON public.v2_models USING btree (status, hidden, model_slug);

CREATE INDEX v2_models_variant_lookup_idx ON public.v2_models USING btree (variant_kind, base_model_slug, model_slug);

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_models
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_models
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER enqueue_public_model_release_push
  AFTER INSERT OR UPDATE OF status, hidden, released_at ON public.v2_models
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_public_model_release_push();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_models
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_models"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING (public.catalog_model_is_public(model_slug));

CREATE POLICY "v2_models_public_select" ON "public"."v2_models"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((hidden = false) AND (status <> 'disabled'::text)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_models" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."v2_models"."base_model_slug" IS 'Optional related standard model. It is not required for standalone free API models.';

COMMENT ON COLUMN "public"."v2_models"."catalogue_status" IS 'Canonical model lifecycle; independent of provider offers and Phaseo routing.';

COMMENT ON COLUMN "public"."v2_models"."license_url" IS 'Authoritative URL for the model licence text or terms; nullable when not verified.';

COMMENT ON COLUMN "public"."v2_models"."variant_kind" IS 'Canonical API model kind. Free models may stand alone or optionally reference a related standard model.';

COMMENT ON TABLE "public"."v2_models" IS 'Authoritative model catalogue. Repository JSON is the sole authoring source.';
