CREATE TABLE "public"."credit_ledger" (
  "id"                        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"              uuid                     NOT NULL,
  "event_time"                timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "kind"                      text                     NOT NULL,
  "amount_nanos"              bigint                   NOT NULL,
  "before_balance_nanos"      bigint                   NOT NULL,
  "after_balance_nanos"       bigint                   NOT NULL,
  "ref_type"                  text                     NOT NULL,
  "ref_id"                    text                     NOT NULL,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "status"                    text,
  "source_ref_type"           text,
  "source_ref_id"             text,
  "refund_claim_state"        text,
  "refund_claim_reason"       text,
  "refund_claimed_at"         timestamp with time zone,
  "refund_claimed_by_user_id" uuid,
  "before_reserved_nanos"     bigint,
  "after_reserved_nanos"      bigint,
  CONSTRAINT "credit_ledger_pkey" PRIMARY KEY (id),
  CONSTRAINT "credit_ledger_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."credit_ledger"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX credit_ledger_ref_type_ref_id_key ON public.credit_ledger USING btree (ref_type, ref_id);

CREATE INDEX credit_ledger_refund_claim_state_idx ON public.credit_ledger USING btree (refund_claim_state)
  WHERE (ref_type = 'Stripe_Payment_Intent'::text);

CREATE INDEX credit_ledger_source_ref_idx ON public.credit_ledger USING btree (source_ref_type, source_ref_id);

CREATE INDEX credit_ledger_workspace_id_idx ON public.credit_ledger USING btree (workspace_id)
  WHERE (workspace_id IS NOT NULL);

CREATE POLICY "Enable insert for users based on user_id" ON "public"."credit_ledger"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "credit_ledger_select_own_team" ON "public"."credit_ledger"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."credit_ledger" TO "service_role";

REVOKE ALL ON TABLE "public"."credit_ledger" FROM "anon";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."credit_ledger" TO "anon";

REVOKE ALL ON TABLE "public"."credit_ledger" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."credit_ledger" TO "authenticated";
