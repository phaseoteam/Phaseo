-- Link each request row to its wallet charge (gateway_request_charges.request_id).
-- Nullable without a default, so adding it rewrites no partition. No index: the
-- reconciliation query in supabase/operations/gateway-billing-reconciliation.sql
-- bounds the join by workspace and time with the existing cursor index.
ALTER TABLE "public"."gateway_requests"
  ADD COLUMN "billing_request_id" text;

COMMENT ON COLUMN "public"."gateway_requests"."billing_request_id" IS 'Wallet charge key for this attempt: gateway_request_charges.request_id in the same workspace. Null for rows written before it was recorded, requests rejected before execution, and requests billed through wallet reservations.';
