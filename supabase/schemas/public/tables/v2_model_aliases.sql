CREATE TABLE "public"."v2_model_aliases" (
  "alias_slug"     text                     NOT NULL,
  "model_slug"     text                     NOT NULL,
  "alias_type"     text                     NOT NULL DEFAULT 'public'::text,
  "enabled"        boolean                  NOT NULL DEFAULT true,
  "effective_from" timestamp with time zone,
  "effective_to"   timestamp with time zone,
  "metadata"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_model_aliases_pkey" PRIMARY KEY (alias_slug),
  CONSTRAINT "v2_model_aliases_slug_check" CHECK (((alias_slug = lower(alias_slug)) AND (alias_slug ~ '^[a-z0-9][a-z0-9._:/+@-]*$'::text))),
  CONSTRAINT "v2_model_aliases_window_check" CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to > effective_from))),
  CONSTRAINT "v2_model_aliases_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_model_aliases"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_model_aliases_active_idx ON public.v2_model_aliases USING btree (alias_slug, effective_from, effective_to)
  WHERE enabled;

CREATE INDEX v2_model_aliases_model_idx ON public.v2_model_aliases USING btree (model_slug)
  WHERE enabled;

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_model_aliases
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_aliases
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_model_aliases
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_model_aliases"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING (public.catalog_model_is_public(model_slug));

CREATE POLICY "v2_model_aliases_public_select" ON "public"."v2_model_aliases"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((enabled = true) AND ((effective_from IS NULL) OR (effective_from <= now())) AND ((effective_to IS NULL) OR (effective_to > now()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_model_aliases" TO "anon", "authenticated", "service_role";
