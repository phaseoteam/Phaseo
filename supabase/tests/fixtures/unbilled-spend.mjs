// private.unbilled_spend, which the request-context key-limit checks read, on a fixture that predates
// what it reads: wallet charges and their adjustment ledger rows, billing_request_id (#3437), and
// expected_cost_nanos, added by this change's own migrations (applied here as written).
import { readFile } from 'node:fs/promises';

const migration = (name) => readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');

export async function installUnbilledSpend(db) {
  await db.exec(`
    create schema if not exists private;
    alter table public.gateway_requests add column if not exists billing_request_id text;
    create table if not exists public.gateway_request_charges (workspace_id uuid not null, request_id text not null,
      cost_nanos bigint not null, status text not null default 'applying', is_final boolean not null default true,
      key_id uuid, created_at timestamptz not null default now(), primary key (workspace_id, request_id));
    create table if not exists public.credit_ledger (id uuid primary key default gen_random_uuid(), workspace_id uuid, kind text,
      amount_nanos bigint, ref_type text, ref_id text, source_ref_type text, source_ref_id text, status text,
      created_at timestamptz not null default now());
    -- As in production.
    grant select on public.gateway_request_charges, public.credit_ledger to service_role;
  `);
  for (const name of ['20261106220400_gateway_requests_expected_cost_nanos.sql', '20261106220401_validate_gateway_requests_expected_cost_nanos_check.sql']) {
    await db.exec(await migration(name));
  }
  await db.exec(await readFile(new URL('../../schemas/private/functions/unbilled_spend.sql', import.meta.url), 'utf8'));
}
