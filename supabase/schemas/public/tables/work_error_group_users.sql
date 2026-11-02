CREATE TABLE "public"."work_error_group_users" (
  "group_id"      uuid                     NOT NULL,
  "user_hash"     text                     NOT NULL,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_error_group_users_hash_check" CHECK ((char_length(user_hash) = 32)),
  CONSTRAINT "work_error_group_users_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.work_error_groups(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_group_users_pkey" PRIMARY KEY (group_id, user_hash)
);

ALTER TABLE "public"."work_error_group_users"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_error_group_users"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_error_group_users" IS 'People an error group affected, as a hash of the app''s user id salted with the project id (never the id itself). Written by public.record_work_error_event.';

REVOKE ALL ON TABLE "public"."work_error_group_users" FROM "service_role";

GRANT DELETE, SELECT ON TABLE "public"."work_error_group_users" TO "service_role";

REVOKE ALL ON TABLE "public"."work_error_group_users" FROM "anon", "authenticated";
