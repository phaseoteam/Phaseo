CREATE TABLE "public"."workspace_rate_limit_overrides" (
  "workspace_id"          uuid                     NOT NULL,
  "requests_per_minute"   integer,
  "free_requests_per_day" integer,
  "reason"                text,
  "set_by"                uuid,
  "expires_at"            timestamp with time zone,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_rate_limit_overrides_free_requests_per_day_check" CHECK (((free_requests_per_day IS NULL) OR (free_requests_per_day > 0))),
  CONSTRAINT "workspace_rate_limit_overrides_limit_present_check" CHECK (((requests_per_minute IS NOT NULL) OR (free_requests_per_day IS NOT NULL))),
  CONSTRAINT "workspace_rate_limit_overrides_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "workspace_rate_limit_overrides_requests_per_minute_check" CHECK (((requests_per_minute IS NULL) OR (requests_per_minute > 0))),
  CONSTRAINT "workspace_rate_limit_overrides_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_rate_limit_overrides"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER workspace_rate_limit_overrides_set_updated_at
  BEFORE UPDATE ON public.workspace_rate_limit_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_rate_limit_overrides"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_rate_limit_overrides" IS 'Operator-managed customer rate limits. An unexpired row always wins over the automatic trust ladder; NULL limit columns keep the ladder value. Manage by inserting/updating rows as service_role; the gateway tier publisher applies changes within about five minutes.';

REVOKE ALL ON TABLE "public"."workspace_rate_limit_overrides" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_rate_limit_overrides" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_rate_limit_overrides" FROM "anon", "authenticated";
