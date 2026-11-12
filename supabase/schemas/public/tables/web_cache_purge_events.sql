CREATE TABLE "public"."web_cache_purge_events" (
  "id"                        bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "scope"                     text                     NOT NULL,
  "target_id"                 text,
  "tags"                      text[]                   NOT NULL,
  "browser_generation_bumped" boolean                  NOT NULL DEFAULT false,
  "generation"                bigint,
  "actor_user_id"             uuid,
  "purge_succeeded"           boolean                  NOT NULL,
  "purge_error"               jsonb,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "web_cache_purge_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "web_cache_purge_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "web_cache_purge_events_scope_check" CHECK ((scope ~ '^[a-z0-9-]{1,64}$'::text)),
  CONSTRAINT "web_cache_purge_events_tags_check" CHECK (((cardinality(tags) >= 1) AND (cardinality(tags) <= 100))),
  CONSTRAINT "web_cache_purge_events_target_id_check" CHECK (((target_id IS NULL) OR (length(target_id) <= 200)))
);

ALTER TABLE "public"."web_cache_purge_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX web_cache_purge_events_actor_user_id_idx ON public.web_cache_purge_events USING btree (actor_user_id);

CREATE INDEX web_cache_purge_events_created_at_idx ON public.web_cache_purge_events USING btree (created_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."web_cache_purge_events"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON SEQUENCE "public"."web_cache_purge_events_id_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."web_cache_purge_events_id_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."web_cache_purge_events_id_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."web_cache_purge_events_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."web_cache_purge_events_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."web_cache_purge_events_id_seq" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."web_cache_purge_events" TO "service_role";

REVOKE ALL ON TABLE "public"."web_cache_purge_events" FROM "anon", "authenticated";
