CREATE TABLE "public"."model_discovery_hf_seen_models" (
  "org_id"        text                     NOT NULL,
  "model_id"      text                     NOT NULL,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "last_seen_at"  timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT "model_discovery_hf_seen_models_pkey" PRIMARY KEY (org_id, model_id)
);

ALTER TABLE "public"."model_discovery_hf_seen_models"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX model_discovery_hf_seen_models_last_seen_at_idx ON public.model_discovery_hf_seen_models USING btree (last_seen_at);

CREATE POLICY "service_role_full_access" ON "public"."model_discovery_hf_seen_models"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."model_discovery_hf_seen_models" TO "service_role";

REVOKE ALL ON TABLE "public"."model_discovery_hf_seen_models" FROM "anon", "authenticated";
