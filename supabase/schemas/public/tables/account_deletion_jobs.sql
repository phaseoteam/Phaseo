CREATE TABLE "public"."account_deletion_jobs" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"            uuid,
  "workspace_ids"      uuid[]                   NOT NULL DEFAULT '{}'::uuid[],
  "key_ids"            uuid[]                   NOT NULL DEFAULT '{}'::uuid[],
  "key_kids"           text[]                   NOT NULL DEFAULT '{}'::text[],
  "status"             text                     NOT NULL DEFAULT 'pending'::text,
  "requested_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "deadline_at"        timestamp with time zone NOT NULL DEFAULT (now() + '30 days'::interval),
  "lease_expires_at"   timestamp with time zone,
  "last_attempt_at"    timestamp with time zone,
  "attempts"           integer                  NOT NULL DEFAULT 0,
  "r2_objects_deleted" integer                  NOT NULL DEFAULT 0,
  "kv_keys_deleted"    integer                  NOT NULL DEFAULT 0,
  "last_error"         text,
  "completed_at"       timestamp with time zone,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "kv_scan_cursor"     text,
  "next_attempt_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "account_deletion_jobs_attempts_check" CHECK ((attempts >= 0)),
  CONSTRAINT "account_deletion_jobs_check1" CHECK (((status = 'completed'::text) = (completed_at IS NOT NULL))),
  CONSTRAINT "account_deletion_jobs_check" CHECK ((deadline_at <= (requested_at + '30 days'::interval))),
  CONSTRAINT "account_deletion_jobs_kv_keys_deleted_check" CHECK ((kv_keys_deleted >= 0)),
  CONSTRAINT "account_deletion_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "account_deletion_jobs_r2_objects_deleted_check" CHECK ((r2_objects_deleted >= 0)),
  CONSTRAINT "account_deletion_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'purging'::text, 'completed'::text, 'failed'::text])))
);

ALTER TABLE "public"."account_deletion_jobs"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX account_deletion_jobs_active_user_uidx ON public.account_deletion_jobs USING btree (user_id)
  WHERE ((user_id IS NOT NULL) AND (status <> 'completed'::text));

CREATE INDEX account_deletion_jobs_pending_idx ON public.account_deletion_jobs USING btree (status, deadline_at, requested_at)
  WHERE (status = ANY (ARRAY['pending'::text, 'purging'::text, 'failed'::text]));

CREATE INDEX account_deletion_jobs_retry_idx ON public.account_deletion_jobs USING btree (next_attempt_at, deadline_at, requested_at)
  WHERE (status = ANY (ARRAY['pending'::text, 'purging'::text, 'failed'::text]));

CREATE POLICY "deny_direct_client_access" ON "public"."account_deletion_jobs"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."account_deletion_jobs" IS 'Service-role-only queue for completing account deletion across Cloudflare stores within 30 days.';

REVOKE ALL ON TABLE "public"."account_deletion_jobs" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."account_deletion_jobs" TO "service_role";

REVOKE ALL ON TABLE "public"."account_deletion_jobs" FROM "anon", "authenticated";
