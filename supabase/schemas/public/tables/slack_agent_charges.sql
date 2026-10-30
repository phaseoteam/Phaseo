CREATE TABLE "public"."slack_agent_charges" (
  "installation_id" uuid                     NOT NULL,
  "workspace_id"    uuid                     NOT NULL,
  "period_start"    date                     NOT NULL,
  "people"          integer                  NOT NULL,
  "answers"         bigint                   NOT NULL,
  "amount_nanos"    bigint                   NOT NULL,
  "status"          text                     NOT NULL DEFAULT 'pending'::text,
  "attempted_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "charged_at"      timestamp with time zone,
  "ledger_ref_id"   text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_agent_charges_charged_check" CHECK (((status = 'charged'::text) = (charged_at IS NOT NULL))),
  CONSTRAINT "slack_agent_charges_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_agent_charges_period_check" CHECK ((period_start = (date_trunc('month'::text, (period_start)::timestamp without time zone))::date)),
  CONSTRAINT "slack_agent_charges_pkey" PRIMARY KEY (installation_id, period_start),
  CONSTRAINT "slack_agent_charges_quantities_check" CHECK (((people >= 0) AND (answers >= 0) AND (amount_nanos >= 0))),
  CONSTRAINT "slack_agent_charges_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'charged'::text]))),
  CONSTRAINT "slack_agent_charges_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."slack_agent_charges"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX slack_agent_charges_pending_idx ON public.slack_agent_charges USING btree (attempted_at)
  WHERE (status = 'pending'::text);

CREATE INDEX slack_agent_charges_workspace_idx ON public.slack_agent_charges USING btree (workspace_id, period_start DESC);

CREATE TRIGGER slack_agent_charges_set_updated_at
  BEFORE UPDATE ON public.slack_agent_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."slack_agent_charges"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_agent_charges" IS 'The Slack agent''s charge for each installation and UTC month, taken from credits by charge_slack_agent_month as one credit_ledger charge (ref_type slack_agent_month). A charge stays pending while the balance is too low and is retried until it succeeds.';

REVOKE ALL ON TABLE "public"."slack_agent_charges" FROM "service_role";

GRANT SELECT ON TABLE "public"."slack_agent_charges" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_agent_charges" FROM "anon", "authenticated";
