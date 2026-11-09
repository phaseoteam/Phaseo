// private.key_spend_items and private.unbilled_spend, which the request-context key-limit checks
// read, on a fixture that predates what they read: wallet charges, their adjustment ledger rows and
// batch reservations, billing_request_id (#3437), detail_metadata, and expected_cost_nanos, added by
// this change's own migrations (applied here as written).
import { readFile } from 'node:fs/promises';

const migration = (name) => readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
const schema = (name) => readFile(new URL(`../../schemas/${name}`, import.meta.url), 'utf8');

export async function installUnbilledSpend(db) {
  await db.exec(`
    create schema if not exists private;
    alter table public.gateway_requests add column if not exists billing_request_id text;
    alter table public.gateway_requests add column if not exists detail_metadata jsonb;
    create table if not exists public.gateway_request_charges (workspace_id uuid not null, request_id text not null,
      cost_nanos bigint not null, status text not null default 'applying', is_final boolean not null default true,
      key_id uuid, created_at timestamptz not null default now(), primary key (workspace_id, request_id));
    create table if not exists public.credit_ledger (id uuid primary key default gen_random_uuid(), workspace_id uuid, kind text,
      amount_nanos bigint, ref_type text, ref_id text, source_ref_type text, source_ref_id text, status text,
      created_at timestamptz not null default now());
    create table if not exists public.gateway_wallet_reservations (workspace_id uuid not null, reservation_id text not null,
      key_id uuid, status text not null default 'held', created_at timestamptz not null default now(),
      primary key (workspace_id, reservation_id));
    create table if not exists public.gateway_async_operations (workspace_id uuid not null, kind text not null,
      internal_id text not null, meta jsonb not null default '{}'::jsonb, unique (workspace_id, kind, internal_id));
    -- As in production.
    grant select on public.gateway_request_charges, public.credit_ledger, public.gateway_wallet_reservations,
      public.gateway_async_operations to service_role;
  `);
  for (const name of ['20261109145504_billing_cutoffs.sql', '20261109145505_gateway_requests_expected_cost_nanos.sql', '20261109145506_validate_gateway_requests_expected_cost_nanos_check.sql']) {
    await db.exec(await migration(name));
  }
  await db.exec(await schema('private/functions/unbilled_spend.sql'));
  await db.exec(await schema('private/functions/key_spend_items.sql'));
}
