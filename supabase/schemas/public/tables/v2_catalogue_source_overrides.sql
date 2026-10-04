CREATE TABLE "public"."v2_catalogue_source_overrides" (
  "source_type"   text                     NOT NULL,
  "source_key"    text                     NOT NULL,
  "disposition"   text                     NOT NULL,
  "actor_user_id" uuid,
  "resource_id"   text,
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_catalogue_source_overrides_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "v2_catalogue_source_overrides_disposition_check" CHECK ((disposition = ANY (ARRAY['database_managed'::text, 'database'::text, 'suppressed'::text, 'stealth'::text]))),
  CONSTRAINT "v2_catalogue_source_overrides_pkey" PRIMARY KEY (source_type, source_key),
  CONSTRAINT "v2_catalogue_source_overrides_type_check"
    CHECK
    ((source_type = ANY (ARRAY['pricing_rule'::text, 'organisations'::text, 'providers'::text, 'benchmarks'::text, 'subscription-plans'::text, 'models'::text, 'model'::text,
    'provider_route'::text])))
);

ALTER TABLE "public"."v2_catalogue_source_overrides"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_catalogue_source_overrides_actor_user_id_idx ON public.v2_catalogue_source_overrides USING btree (actor_user_id);

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_catalogue_source_overrides
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE POLICY "service_role_full_access" ON "public"."v2_catalogue_source_overrides"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_catalogue_source_overrides" TO "service_role";

COMMENT ON TABLE "public"."v2_catalogue_source_overrides" IS 'Prevents repository imports from recreating or overwriting catalogue records that an admin moved under database ownership.';

REVOKE ALL ON TABLE "public"."v2_catalogue_source_overrides" FROM "anon", "authenticated";
