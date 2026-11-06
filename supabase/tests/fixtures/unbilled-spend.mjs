// private.unbilled_spend, which the request-context key-limit checks read, with the columns it
// needs on a fixture that predates them (wallet charges, billing_request_id from #3437,
// expected_cost_nanos from fix/tool-billing-20261104).
import { readFile } from 'node:fs/promises';

export async function installUnbilledSpend(db) {
  await db.exec(`
    create schema if not exists private;
    alter table public.gateway_requests
      add column if not exists billing_request_id text, add column if not exists expected_cost_nanos bigint;
    create table if not exists public.gateway_request_charges (workspace_id uuid not null, request_id text not null,
      cost_nanos bigint not null, status text not null default 'applying', is_final boolean not null default true,
      key_id uuid, created_at timestamptz not null default now(), primary key (workspace_id, request_id));
    -- As in production (gateway_request_charges.sql).
    grant select on public.gateway_request_charges to service_role;
  `);
  await db.exec(await readFile(new URL('../../schemas/private/functions/unbilled_spend.sql', import.meta.url), 'utf8'));
}
