CREATE TABLE "public"."connect_charges" (
  "workspace_id"  uuid                     NOT NULL,
  "period_start"  date                     NOT NULL,
  "days_on"       integer                  NOT NULL,
  "days_in_month" integer                  NOT NULL,
  "amount_nanos"  bigint                   NOT NULL,
  "status"        text                     NOT NULL DEFAULT 'pending'::text,
  "attempted_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "charged_at"    timestamp with time zone,
  "ledger_ref_id" text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "connect_charges_charged_check" CHECK (((status = 'charged'::text) = (charged_at IS NOT NULL))),
  CONSTRAINT "connect_charges_period_check" CHECK ((period_start = (date_trunc('month'::text, (period_start)::timestamp without time zone))::date)),
  CONSTRAINT "connect_charges_pkey" PRIMARY KEY (workspace_id, period_start),
  CONSTRAINT "connect_charges_quantities_check" CHECK (((days_on >= 1) AND (days_on <= days_in_month) AND (days_in_month >= 28) AND (days_in_month <= 31) AND (amount_nanos >= 0) AND (amount_nanos <= 1000000000))),
  CONSTRAINT "connect_charges_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'charged'::text]))),
  CONSTRAINT "connect_charges_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."connect_charges"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX connect_charges_pending_idx ON public.connect_charges USING btree (attempted_at)
  WHERE (status = 'pending'::text);

CREATE TRIGGER connect_charges_set_updated_at
  BEFORE UPDATE ON public.connect_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."connect_charges"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."connect_charges" IS 'Phaseo Connect''s charge for each workspace and finished UTC month: $1 times the days it was on over the days in the month, rounded down to the nanodollar, taken from credits by charge_connect_month as one credit_ledger charge (ref_type connect_month). A charge stays pending while the balance is too low and is retried at the amount fixed by its first attempt.';

REVOKE ALL ON TABLE "public"."connect_charges" FROM "service_role";

GRANT SELECT ON TABLE "public"."connect_charges" TO "service_role";

REVOKE ALL ON TABLE "public"."connect_charges" FROM "anon", "authenticated";
