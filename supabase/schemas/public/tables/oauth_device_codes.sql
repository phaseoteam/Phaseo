CREATE TABLE "public"."oauth_device_codes" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "device_code_hash" text                     NOT NULL,
  "user_code_hash"   text                     NOT NULL,
  "client_id"        text                     NOT NULL,
  "user_id"          uuid,
  "workspace_id"     uuid,
  "scopes"           text[]                   NOT NULL DEFAULT '{}'::text[],
  "status"           text                     NOT NULL DEFAULT 'pending'::text,
  "interval_seconds" integer                  NOT NULL DEFAULT 5,
  "expires_at"       timestamp with time zone NOT NULL,
  "approved_at"      timestamp with time zone,
  "denied_at"        timestamp with time zone,
  "consumed_at"      timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "last_polled_at"   timestamp with time zone,
  CONSTRAINT "oauth_device_codes_device_code_hash_key" UNIQUE (device_code_hash),
  CONSTRAINT "oauth_device_codes_pkey" PRIMARY KEY (id),
  CONSTRAINT "oauth_device_codes_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'expired'::text]))),
  CONSTRAINT "oauth_device_codes_user_code_hash_key" UNIQUE (user_code_hash),
  CONSTRAINT "oauth_device_codes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "oauth_device_codes_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."oauth_device_codes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX oauth_device_codes_client_status_idx ON public.oauth_device_codes USING btree (client_id, status, expires_at);

CREATE INDEX oauth_device_codes_user_idx ON public.oauth_device_codes USING btree (user_id)
  WHERE (user_id IS NOT NULL);

CREATE INDEX oauth_device_codes_workspace_id_idx ON public.oauth_device_codes USING btree (workspace_id);

CREATE POLICY "service_role_full_access" ON "public"."oauth_device_codes"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."oauth_device_codes" TO "service_role";

REVOKE ALL ON TABLE "public"."oauth_device_codes" FROM "anon", "authenticated";
