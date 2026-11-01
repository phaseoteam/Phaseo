CREATE TABLE "public"."connect_subscriptions" (
  "workspace_id" uuid                     NOT NULL,
  "enabled"      boolean                  NOT NULL DEFAULT false,
  "payment_due"  boolean                  NOT NULL DEFAULT false,
  "enabled_at"   timestamp with time zone,
  "disabled_at"  timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by"   uuid,
  CONSTRAINT "connect_subscriptions_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "connect_subscriptions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "connect_subscriptions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."connect_subscriptions"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER connect_subscriptions_set_updated_at
  BEFORE UPDATE ON public.connect_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."connect_subscriptions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."connect_subscriptions"."enabled" IS 'Whether the workspace wants Phaseo Connect on: the switch in the desktop app. Changed only through public.set_connect_enabled.';

COMMENT ON COLUMN "public"."connect_subscriptions"."payment_due" IS 'A finished month''s Connect charge could not be taken from credits. Connect is off (no billing period open, the relay refuses the desktop) until charge_connect_month takes every pending month, then it resumes if enabled.';

COMMENT ON TABLE "public"."connect_subscriptions" IS 'Phaseo Connect (the phone relay, $1 a month from credits, prorated by the UTC days it was on) for each workspace. The days billed come from connect_subscription_periods. Service role reads only; changes go through set_connect_enabled and charge_connect_month.';

REVOKE ALL ON TABLE "public"."connect_subscriptions" FROM "service_role";

GRANT SELECT ON TABLE "public"."connect_subscriptions" TO "service_role";

REVOKE ALL ON TABLE "public"."connect_subscriptions" FROM "anon", "authenticated";
