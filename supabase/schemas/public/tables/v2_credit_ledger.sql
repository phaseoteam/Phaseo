CREATE TABLE "public"."v2_credit_ledger" (
  "entry_id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    uuid                     NOT NULL,
  "event_time"      timestamp with time zone NOT NULL DEFAULT now(),
  "entry_type"      text                     NOT NULL,
  "amount_nanos"    bigint                   NOT NULL,
  "currency"        text                     NOT NULL DEFAULT 'USD'::text,
  "source_type"     text,
  "source_id"       text,
  "idempotency_key" text                     NOT NULL,
  "metadata"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_credit_ledger_amount_check" CHECK ((amount_nanos <> 0)),
  CONSTRAINT "v2_credit_ledger_idempotency_check" CHECK ((length(TRIM(BOTH FROM idempotency_key)) > 0)),
  CONSTRAINT "v2_credit_ledger_pkey" PRIMARY KEY (entry_id),
  CONSTRAINT "v2_credit_ledger_source_check" CHECK (((source_type IS NULL) = (source_id IS NULL))),
  CONSTRAINT "v2_credit_ledger_type_check"
    CHECK
    ((entry_type = ANY (ARRAY['payment'::text, 'grant'::text, 'refund'::text, 'charge'::text, 'reservation_capture'::text, 'reservation_release'::text, 'adjustment'::text,
    'expiration'::text]))),
  CONSTRAINT "v2_credit_ledger_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES private.usage_workspace_identity(workspace_id) ON DELETE RESTRICT
);

ALTER TABLE "public"."v2_credit_ledger"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX v2_credit_ledger_idempotency_key ON public.v2_credit_ledger USING btree (workspace_id, idempotency_key);

CREATE INDEX v2_credit_ledger_source_idx ON public.v2_credit_ledger USING btree (source_type, source_id)
  WHERE (source_type IS NOT NULL);

CREATE INDEX v2_credit_ledger_workspace_time_idx ON public.v2_credit_ledger USING btree (workspace_id, event_time DESC, entry_id DESC);

CREATE POLICY "v2_credit_ledger_workspace_select" ON "public"."v2_credit_ledger"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.is_workspace_member(v2_credit_ledger.workspace_id) AS is_workspace_member));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_credit_ledger" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."v2_credit_ledger" IS 'Append-only balance-affecting credit entries. Do not write temporary holds here.';
