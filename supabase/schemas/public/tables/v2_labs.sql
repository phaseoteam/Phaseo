CREATE TABLE "public"."v2_labs" (
  "lab_slug"         text                     NOT NULL,
  "name"             text                     NOT NULL,
  "country_code"     text                     NOT NULL DEFAULT 'xx'::text,
  "description"      text,
  "status"           text                     NOT NULL DEFAULT 'active'::text,
  "routable"         boolean                  NOT NULL DEFAULT false,
  "metadata"         jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "subdivision_code" text,
  "colour"           text,
  CONSTRAINT "v2_labs_pkey" PRIMARY KEY (lab_slug),
  CONSTRAINT "v2_labs_slug_check" CHECK (((lab_slug = lower(lab_slug)) AND (lab_slug ~ '^[a-z0-9][a-z0-9._-]*$'::text))),
  CONSTRAINT "v2_labs_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'deprecated'::text, 'disabled'::text]))),
  CONSTRAINT "v2_labs_subdivision_code_check"
    CHECK
    (((subdivision_code IS NULL) OR ((subdivision_code = upper(btrim(subdivision_code))) AND (subdivision_code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'::text) AND ((lower(btrim(country_code))
    = 'xx'::text) OR (split_part(subdivision_code, '-'::text, 1) = upper(btrim(country_code)))))))
);

ALTER TABLE "public"."v2_labs"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX v2_labs_name_key ON public.v2_labs USING btree (lower(name));

CREATE INDEX v2_labs_status_idx ON public.v2_labs USING btree (status)
  WHERE (status <> 'disabled'::text);

CREATE INDEX v2_labs_subdivision_idx ON public.v2_labs USING btree (subdivision_code)
  WHERE (subdivision_code IS NOT NULL);

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_labs
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_labs
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER sync_v2_lab_colour_from_metadata
  BEFORE INSERT OR UPDATE OF metadata ON public.v2_labs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_v2_lab_colour();

CREATE POLICY "v2_labs_public_select" ON "public"."v2_labs"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((status <> 'disabled'::text));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_labs" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."v2_labs"."subdivision_code" IS 'Primary organisation location as an ISO 3166-2 subdivision code, for example US-CA.';
