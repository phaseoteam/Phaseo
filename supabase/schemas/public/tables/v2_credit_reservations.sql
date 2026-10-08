CREATE TABLE "public"."v2_credit_reservations" (
  "reservation_id"  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    uuid                     NOT NULL,
  "purpose"         text                     NOT NULL,
  "amount_nanos"    bigint                   NOT NULL,
  "captured_nanos"  bigint                   NOT NULL DEFAULT 0,
  "released_nanos"  bigint                   NOT NULL DEFAULT 0,
  "status"          text                     NOT NULL DEFAULT 'held'::text,
  "idempotency_key" text                     NOT NULL,
  "external_ref"    text,
  "expires_at"      timestamp with time zone NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "captured_at"     timestamp with time zone,
  "released_at"     timestamp with time zone,
  "metadata"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "v2_credit_reservations_amount_check" CHECK ((amount_nanos > 0)),
  CONSTRAINT "v2_credit_reservations_balance_check" CHECK (((captured_nanos + released_nanos) <= amount_nanos)),
  CONSTRAINT "v2_credit_reservations_captured_check" CHECK ((captured_nanos >= 0)),
  CONSTRAINT "v2_credit_reservations_idempotency_check" CHECK ((length(TRIM(BOTH FROM idempotency_key)) > 0)),
  CONSTRAINT "v2_credit_reservations_key" UNIQUE (workspace_id, idempotency_key),
  CONSTRAINT "v2_credit_reservations_pkey" PRIMARY KEY (reservation_id),
  CONSTRAINT "v2_credit_reservations_released_check" CHECK ((released_nanos >= 0)),
  CONSTRAINT "v2_credit_reservations_status_check"
    CHECK ((status = ANY (ARRAY['held'::text, 'partially_captured'::text, 'captured'::text, 'partially_released'::text, 'released'::text, 'expired'::text, 'cancelled'::text]))),
  CONSTRAINT "v2_credit_reservations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES private.usage_workspace_identity(workspace_id) ON DELETE RESTRICT
);

ALTER TABLE "public"."v2_credit_reservations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_credit_reservations_expiry_idx ON public.v2_credit_reservations USING btree (expires_at)
  WHERE (status = ANY (ARRAY['held'::text, 'partially_captured'::text, 'partially_released'::text]));

CREATE INDEX v2_credit_reservations_external_ref_idx ON public.v2_credit_reservations USING btree (external_ref)
  WHERE (external_ref IS NOT NULL);

CREATE INDEX v2_credit_reservations_workspace_status_idx ON public.v2_credit_reservations USING btree (workspace_id, status, created_at DESC);

CREATE POLICY "v2_credit_reservations_workspace_select" ON "public"."v2_credit_reservations"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.is_workspace_member(v2_credit_reservations.workspace_id) AS is_workspace_member));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_credit_reservations" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."v2_credit_reservations" IS 'Temporary credit holds for batch, video, and other asynchronous operations; capture/release emits ledger entries.';
