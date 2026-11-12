CREATE TABLE "public"."credit_topup_requests" (
  "id"                         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"               uuid                     NOT NULL,
  "requested_by"               uuid,
  "requested_via"              text                     NOT NULL,
  "oauth_client_id"            text,
  "flow"                       text                     NOT NULL,
  "amount_cents"               integer                  NOT NULL,
  "currency"                   text                     DEFAULT 'usd'::text NOT NULL,
  "payment_method_id"          text,
  "payment_method_brand"       text,
  "payment_method_last4"       text,
  "status"                     text                     DEFAULT 'pending'::text NOT NULL,
  "reason"                     text,
  "confirm_token_hash"         text                     NOT NULL,
  "idempotency_key"            text,
  "stripe_payment_intent_id"   text,
  "stripe_checkout_session_id" text,
  "decided_by"                 uuid,
  "decided_at"                 timestamp with time zone,
  "paid_at"                    timestamp with time zone,
  "expires_at"                 timestamp with time zone NOT NULL,
  "created_at"                 timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"                 timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_topup_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "credit_topup_requests_amount_cents_check" CHECK (((amount_cents >= 500) AND (amount_cents <= 50000))),
  CONSTRAINT "credit_topup_requests_currency_check" CHECK ((currency = 'usd'::text)),
  CONSTRAINT "credit_topup_requests_flow_check" CHECK ((flow = ANY (ARRAY['checkout'::text, 'saved_card'::text]))),
  CONSTRAINT "credit_topup_requests_idempotency_key_check" CHECK (((idempotency_key IS NULL) OR ((length(idempotency_key) >= 1) AND (length(idempotency_key) <= 255)))),
  CONSTRAINT "credit_topup_requests_requested_via_check" CHECK ((requested_via = ANY (ARRAY['oauth'::text, 'management_key'::text]))),
  CONSTRAINT "credit_topup_requests_saved_card_check" CHECK (((flow = 'checkout'::text) OR (payment_method_id IS NOT NULL))),
  CONSTRAINT "credit_topup_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'expired'::text, 'paid'::text, 'failed'::text]))),
  CONSTRAINT "credit_topup_requests_stripe_checkout_session_id_key" UNIQUE (stripe_checkout_session_id),
  CONSTRAINT "credit_topup_requests_stripe_payment_intent_id_key" UNIQUE (stripe_payment_intent_id),
  CONSTRAINT "credit_topup_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."credit_topup_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX credit_topup_requests_idempotency_idx ON public.credit_topup_requests USING btree (workspace_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE INDEX credit_topup_requests_workspace_pending_idx ON public.credit_topup_requests USING btree (workspace_id, expires_at) WHERE (status = 'pending'::text);

CREATE POLICY "deny_direct_client_access" ON "public"."credit_topup_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."credit_topup_requests" IS 'Credit top-ups started from the API or CLI (billing:write). checkout: the requester pays with a new card through Stripe Checkout. saved_card: a workspace owner or admin confirms the charge on an emailed, single-use link. Credits are applied only by the Stripe payment webhook. Service role only.';

COMMENT ON COLUMN "public"."credit_topup_requests"."confirm_token_hash" IS 'SHA-256 hex of the single-use token in the confirm link. The token itself is never stored here.';

COMMENT ON COLUMN "public"."credit_topup_requests"."reason" IS 'Reason code for declined, expired and failed requests (declined, expired, card_declined, authentication_failed, payment_failed, ...).';

REVOKE ALL ON TABLE "public"."credit_topup_requests" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."credit_topup_requests" TO "service_role";

REVOKE ALL ON TABLE "public"."credit_topup_requests" FROM "anon", "authenticated";
