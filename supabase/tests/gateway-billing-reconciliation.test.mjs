import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../migrations/20261103133059_gateway_requests_billing_request_id.sql');
const schema = await read('../schemas/public/tables/gateway_requests.sql');
const reconciliation = await read('../operations/gateway-billing-reconciliation.sql');

// The declarative definition and the forward migration describe the same column.
// Later columns (expected_cost_nanos) and constraints may follow it.
assert.match(schema, /"billing_request_id"\s+text,?\n[\s\S]*?\) PARTITION BY RANGE/);
const comment = migration.match(/COMMENT ON COLUMN [^\n]+/)[0];
assert.ok(schema.includes(comment), 'schema and migration column comments differ');

const db = new PGlite();
try {
  await db.exec(`
    create table public.gateway_requests (
      id uuid not null default gen_random_uuid(), created_at timestamptz not null,
      workspace_id uuid not null, request_id text not null, provider text, model_id text,
      api_model_id text, success boolean not null, byok boolean not null default false,
      cost_nanos bigint, pricing_lines jsonb not null default '[]', detail_metadata jsonb
    ) partition by range (created_at);
    create table public.gateway_requests_2026_11 partition of public.gateway_requests
      for values from ('2026-11-01') to ('2026-12-01');
    create table public.gateway_request_charges (
      workspace_id uuid not null, request_id text not null, cost_nanos bigint not null,
      status text not null, created_at timestamptz not null,
      primary key (workspace_id, request_id)
    );
  `);
  await db.exec(migration);

  const ws = '00000000-0000-4000-8000-000000000001';
  const line = (dimension, quantity, nanos) => ({ dimension, quantity, line_nanos: nanos, unit_price_usd: '0.000001' });
  const rows = [
    // A model fallback: the primary attempt failed and was not charged; the fallback served.
    ['req_primary', 'bill_primary', false, null, 'openai', []],
    ['req_fallback', 'bill_fallback', true, 12345, 'anthropic', [line('input_text_tokens', 1000, 10000), line('output_text_tokens', 50, 2345)]],
    ['req_plain', 'bill_plain', true, 500, 'anthropic', [line('input_text_tokens', 500, 500)]],
    ['req_mismatch', 'bill_mismatch', true, 700, 'openai', [line('input_text_tokens', 700, 700)]],
    // Written before the link existed.
    ['req_unlinked', null, true, 100, 'openai', [line('input_text_tokens', 100, 100)]],
    // Two rows carrying one charge key: the charge must still count once.
    ['req_dup_a', 'bill_dup', true, 300, 'groq', [line('input_text_tokens', 300, 300)]],
    ['req_dup_b', 'bill_dup', true, 300, 'groq', [line('input_text_tokens', 300, 300)]],
  ];
  for (const [requestId, billingId, success, cost, provider, lines] of rows) {
    await db.query(
      `insert into public.gateway_requests (created_at, workspace_id, request_id, billing_request_id, provider, model_id, success, cost_nanos, pricing_lines)
       values ('2026-11-03 10:00:05+00', $1, $2, $3, $4, 'some/model', $5, $6, $7)`,
      [ws, requestId, billingId, provider, success, cost, JSON.stringify(lines)],
    );
  }
  for (const [billingId, cost] of [['bill_fallback', 12345], ['bill_plain', 500], ['bill_mismatch', 800], ['bill_orphan', 900], ['bill_dup', 300]]) {
    await db.query(
      `insert into public.gateway_request_charges values ($1, $2, $3, 'applied', '2026-11-03 10:00:04+00')`,
      [ws, billingId, cost],
    );
  }

  const statements = reconciliation.split(/;\s*\n/).map((s) => s.trim())
    .filter((s) => s.replace(/--[^\n]*/g, '').trim());
  assert.equal(statements.length, 3);
  const [charges, paid, providerTotals] = await Promise.all(statements.map((s) => db.query(s)));

  const byOutcome = (result) => Object.fromEntries(result.rows.map((row) => [row.outcome, row]));
  const chargeOutcomes = byOutcome(charges);
  assert.deepEqual(Object.keys(chargeOutcomes).sort(),
    ['amount_mismatch', 'charge_linked_to_multiple_rows', 'charge_without_request_row', 'matched']);
  assert.equal(Number(chargeOutcomes.matched.charges), 2);
  assert.equal(Number(chargeOutcomes.matched.charged_nanos), 12845);
  assert.equal(Number(chargeOutcomes.amount_mismatch.charged_nanos), 800);
  assert.equal(Number(chargeOutcomes.charge_without_request_row.charged_nanos), 900);
  assert.equal(Number(chargeOutcomes.charge_linked_to_multiple_rows.charges), 1);
  assert.equal(Number(chargeOutcomes.charge_linked_to_multiple_rows.charged_nanos), 300);

  const paidOutcomes = byOutcome(paid);
  assert.deepEqual(Object.keys(paidOutcomes).sort(), ['amount_mismatch', 'charge_shared_by_rows', 'charged', 'not_linked']);
  assert.equal(Number(paidOutcomes.charged.request_rows), 2);
  assert.equal(Number(paidOutcomes.not_linked.request_rows), 1);
  assert.equal(Number(paidOutcomes.charge_shared_by_rows.request_rows), 2);
  assert.equal(Number(paidOutcomes.charge_shared_by_rows.request_cost_nanos), 600);
  assert.equal(Number(paidOutcomes.charge_shared_by_rows.charged_nanos), 300);

  const anthropicOutput = providerTotals.rows.find((row) => row.provider === 'anthropic' && row.meter === 'output_text_tokens');
  assert.equal(Number(anthropicOutput.quantity), 50);
  assert.equal(Number(anthropicOutput.charged_nanos), 2345);
  // The failed primary attempt contributes nothing to customer-side totals.
  assert.equal(providerTotals.rows.filter((row) => row.provider === 'openai').reduce((sum, row) => sum + Number(row.requests), 0), 2);

  console.log('gateway billing reconciliation: ok');
} finally {
  await db.close();
}
