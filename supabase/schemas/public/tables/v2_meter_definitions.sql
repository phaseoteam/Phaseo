CREATE TABLE "public"."v2_meter_definitions" (
  "meter_key"             text                     NOT NULL,
  "display_name"          text                     NOT NULL,
  "modality"              text                     NOT NULL,
  "direction"             text,
  "unit"                  text                     NOT NULL,
  "default_unit_quantity" numeric(30,12)           NOT NULL DEFAULT 1,
  "description"           text,
  "status"                text                     NOT NULL DEFAULT 'active'::text,
  "metadata"              jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_meter_definitions_direction_check" CHECK (((direction IS NULL) OR (direction = ANY (ARRAY['input'::text, 'output'::text])))),
  CONSTRAINT "v2_meter_definitions_key_check" CHECK (((meter_key = lower(meter_key)) AND (meter_key ~ '^[a-z0-9][a-z0-9._:-]*$'::text))),
  CONSTRAINT "v2_meter_definitions_pkey" PRIMARY KEY (meter_key),
  CONSTRAINT "v2_meter_definitions_quantity_check" CHECK ((default_unit_quantity > (0)::numeric)),
  CONSTRAINT "v2_meter_definitions_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'deprecated'::text, 'disabled'::text])))
);

ALTER TABLE "public"."v2_meter_definitions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_meter_definitions_active_idx ON public.v2_meter_definitions USING btree (modality, direction, meter_key)
  WHERE (status = 'active'::text);

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_meter_definitions
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE POLICY "v2_meter_definitions_public_select" ON "public"."v2_meter_definitions"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((status <> 'disabled'::text));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_meter_definitions" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."v2_meter_definitions" IS 'Canonical, small vocabulary of measurable usage dimensions. Price rates reference these definitions.';
