CREATE TABLE "public"."workspace_top_up_fee_decisions" (
  "stripe_payment_intent_id" text                     NOT NULL,
  "workspace_id"             uuid                     NOT NULL,
  "period_start"             date                     NOT NULL,
  "payment_rail"             text                     NOT NULL,
  "gross_nanos"              bigint                   NOT NULL,
  "fee_waived"               boolean                  NOT NULL,
  "allowance_before_nanos"   bigint                   NOT NULL DEFAULT 0,
  "allowance_after_nanos"    bigint                   NOT NULL DEFAULT 0,
  "reason"                   text                     NOT NULL,
  "created_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_top_up_fee_decisions_allowance_after_nanos_check" CHECK ((allowance_after_nanos >= 0)),
  CONSTRAINT "workspace_top_up_fee_decisions_allowance_before_nanos_check" CHECK ((allowance_before_nanos >= 0)),
  CONSTRAINT "workspace_top_up_fee_decisions_gross_nanos_check" CHECK ((gross_nanos >= 0)),
  CONSTRAINT "workspace_top_up_fee_decisions_payment_rail_check" CHECK ((payment_rail = ANY (ARRAY['card'::text, 'ach'::text, 'bank_transfer'::text, 'unknown'::text]))),
  CONSTRAINT "workspace_top_up_fee_decisions_pkey" PRIMARY KEY (stripe_payment_intent_id),
  CONSTRAINT "workspace_top_up_fee_decisions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_top_up_fee_decisions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_top_up_fee_decisions_workspace_period_idx ON public.workspace_top_up_fee_decisions USING btree (workspace_id, period_start);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_top_up_fee_decisions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_top_up_fee_decisions" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_top_up_fee_decisions" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_top_up_fee_decisions" FROM "anon", "authenticated";
