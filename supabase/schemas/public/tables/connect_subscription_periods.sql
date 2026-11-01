CREATE TABLE "public"."connect_subscription_periods" (
  "id"           bigint                   GENERATED ALWAYS AS IDENTITY,
  "workspace_id" uuid                     NOT NULL,
  "started_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "started_by"   uuid,
  "ended_at"     timestamp with time zone,
  "ended_by"     uuid,
  "ended_reason" text,
  CONSTRAINT "connect_subscription_periods_ended_check" CHECK ((((ended_at IS NULL) AND (ended_reason IS NULL) AND (ended_by IS NULL)) OR ((ended_at >= started_at) AND (ended_reason = ANY (ARRAY['turned_off'::text, 'payment_due'::text]))))),
  CONSTRAINT "connect_subscription_periods_ended_by_fkey" FOREIGN KEY (ended_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "connect_subscription_periods_pkey" PRIMARY KEY (id),
  CONSTRAINT "connect_subscription_periods_started_by_fkey" FOREIGN KEY (started_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "connect_subscription_periods_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.connect_subscriptions(workspace_id) ON DELETE CASCADE
);

ALTER TABLE "public"."connect_subscription_periods"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX connect_subscription_periods_open_idx ON public.connect_subscription_periods USING btree (workspace_id)
  WHERE (ended_at IS NULL);

CREATE INDEX connect_subscription_periods_workspace_idx ON public.connect_subscription_periods USING btree (workspace_id, started_at);

CREATE POLICY "deny_direct_client_access" ON "public"."connect_subscription_periods"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."connect_subscription_periods" IS 'Each stretch Phaseo Connect was on for a workspace, so proration is exact: a UTC day is billed if any period overlaps it. Append-only: set_connect_enabled opens a period and later sets its end once; charge_connect_month ends it while a month is unpaid. At most one open period per workspace.';

REVOKE ALL ON TABLE "public"."connect_subscription_periods" FROM "service_role";

GRANT SELECT ON TABLE "public"."connect_subscription_periods" TO "service_role";

REVOKE ALL ON TABLE "public"."connect_subscription_periods" FROM "anon", "authenticated";
