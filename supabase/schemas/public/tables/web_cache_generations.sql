CREATE TABLE "public"."web_cache_generations" (
  "scope"      text                     NOT NULL,
  "generation" bigint                   NOT NULL DEFAULT 1,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid,
  CONSTRAINT "web_cache_generations_generation_check" CHECK ((generation > 0)),
  CONSTRAINT "web_cache_generations_pkey" PRIMARY KEY (scope),
  CONSTRAINT "web_cache_generations_scope_check" CHECK ((scope ~ '^[a-z0-9-]{1,64}$'::text)),
  CONSTRAINT "web_cache_generations_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE "public"."web_cache_generations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX web_cache_generations_updated_by_idx ON public.web_cache_generations USING btree (updated_by);

CREATE POLICY "service_role_full_access" ON "public"."web_cache_generations"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."web_cache_generations" TO "service_role";

REVOKE ALL ON TABLE "public"."web_cache_generations" FROM "anon", "authenticated";
