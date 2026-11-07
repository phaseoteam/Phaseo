CREATE TABLE "public"."v2_service_tiers" (
  "service_tier_slug" text                     NOT NULL,
  "display_name"      text                     NOT NULL,
  "description"       text,
  "status"            text                     NOT NULL DEFAULT 'active'::text,
  "metadata"          jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_service_tiers_pkey" PRIMARY KEY (service_tier_slug),
  CONSTRAINT "v2_service_tiers_slug_check" CHECK (((service_tier_slug = lower(service_tier_slug)) AND (service_tier_slug ~ '^[a-z0-9][a-z0-9._:-]*$'::text))),
  CONSTRAINT "v2_service_tiers_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'deprecated'::text, 'disabled'::text])))
);

ALTER TABLE "public"."v2_service_tiers"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_service_tiers
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_service_tiers
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "v2_service_tiers_public_select" ON "public"."v2_service_tiers"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((status <> 'disabled'::text));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_service_tiers" TO "anon", "authenticated", "service_role";
