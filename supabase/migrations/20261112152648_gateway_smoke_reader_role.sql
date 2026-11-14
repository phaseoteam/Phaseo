-- Read-only role for the "Gateway Smoke" workflow's DB checks (scripts/gateway-smoke.md).
--
-- The role is created NOLOGIN and without a password; no credential lives in the repo.
-- After this migration deploys, the owner enables it once, outside the repo:
--   alter role gateway_smoke_reader login password '<generated>';
-- and stores the connection URL in the gateway-smoke environment's GATEWAY_SMOKE_DATABASE_URL.
--
-- The six tables have RLS, so the role bypasses it, but it can only SELECT the columns
-- scripts/gateway-smoke.mjs reads (QUERIES). It cannot read prompts, error messages,
-- trace data or other request content. Widen these grants only together with QUERIES.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gateway_smoke_reader') then
    create role gateway_smoke_reader nologin bypassrls noinherit connection limit 3;
  end if;
end
$$;

alter role gateway_smoke_reader set default_transaction_read_only = on;
alter role gateway_smoke_reader set statement_timeout = '15s';
alter role gateway_smoke_reader set idle_in_transaction_session_timeout = '30s';

grant usage on schema public to gateway_smoke_reader;

grant select (
  request_id, workspace_id, billing_request_id, created_at, success, stream, byok, error_code,
  cost_nanos, expected_cost_nanos, usage_input_tokens, usage_output_tokens
) on table public.gateway_requests to gateway_smoke_reader;

grant select (workspace_id, request_id, cost_nanos, status, is_final)
  on table public.gateway_request_charges to gateway_smoke_reader;

grant select (workspace_id, request_id, success, cost_nanos)
  on table public.v2_request_facts to gateway_smoke_reader;

grant select (
  workspace_id, ref_type, ref_id, source_ref_type, source_ref_id, amount_nanos,
  before_balance_nanos, before_reserved_nanos, created_at
) on table public.credit_ledger to gateway_smoke_reader;

grant select (workspace_id, kind, internal_id, status, billed_at, meta)
  on table public.gateway_async_operations to gateway_smoke_reader;

grant select (
  workspace_id, reservation_id, status, amount_nanos, settled_amount_nanos,
  captured_nanos, released_nanos, overdraft_nanos
) on table public.gateway_wallet_reservations to gateway_smoke_reader;
