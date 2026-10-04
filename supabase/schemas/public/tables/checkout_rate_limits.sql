CREATE TABLE "public"."checkout_rate_limits" (
  "workspace_id"  uuid                     NOT NULL,
  "user_id"       uuid                     NOT NULL,
  "bucket_start"  timestamp with time zone NOT NULL,
  "request_count" integer                  NOT NULL,
  CONSTRAINT "checkout_rate_limits_pkey" PRIMARY KEY (workspace_id, user_id, bucket_start),
  CONSTRAINT "checkout_rate_limits_request_count_check" CHECK ((request_count >= 1)),
  CONSTRAINT "checkout_rate_limits_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "checkout_rate_limits_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."checkout_rate_limits"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX checkout_rate_limits_bucket_start_idx ON public.checkout_rate_limits USING btree (bucket_start);

CREATE INDEX checkout_rate_limits_user_id_idx ON public.checkout_rate_limits USING btree (user_id);

CREATE POLICY "deny_direct_client_access" ON "public"."checkout_rate_limits"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."checkout_rate_limits" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."checkout_rate_limits" TO "service_role";

REVOKE ALL ON TABLE "public"."checkout_rate_limits" FROM "anon", "authenticated";
