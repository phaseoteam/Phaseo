import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

// Real table definitions without the route/variant/tier foreign keys this data migration
// does not touch. Full replay (triggers, RLS, schema equivalence) runs separately in CI.
async function createTable(name) {
  const sql = await read(`../schemas/public/tables/${name}.sql`);
  const statement = sql.slice(0, sql.indexOf('\n);') + 3)
    .split('\n')
    .filter(line => !/FOREIGN KEY/.test(line) || /v2_pricing_skus\(sku_id\)/.test(line))
    .join('\n')
    .replace(/,\s*\n\);$/, '\n);');
  await db.exec(statement);
}

const nanos = usd => usd * 1_000_000_000;

try {
  await createTable('v2_pricing_skus');
  await createTable('v2_pricing_sku_meters');

  const skus = [
    // Gemini 3.1 Pro Preview: two long-context standard SKUs and a batch SKU.
    ['00000000-0000-0000-0000-000000000001', 'google-ai-studio:google/gemini-3.1-pro-preview', 'standard', 2],
    ['00000000-0000-0000-0000-000000000002', 'google-ai-studio:google/gemini-3.1-pro-preview', 'standard', 4],
    ['00000000-0000-0000-0000-000000000003', 'google-ai-studio:google/gemini-3.1-pro-preview', 'batch', 1],
    // OpenAI pro: no cache discount.
    ['00000000-0000-0000-0000-000000000004', 'openai:openai/gpt-5.5-pro', 'standard', 30],
    // Kimi K3 already has a cached-read row; only writes are added.
    ['00000000-0000-0000-0000-000000000005', 'moonshotai:moonshotai/kimi-k3', 'standard', 3],
    // Claude on AWS (US residency uplift) gains a 1-hour write row.
    ['00000000-0000-0000-0000-000000000006', 'anthropic-aws-us:anthropic/claude-sonnet-5', 'standard', 2.2],
    // OVHcloud $0 cache rows.
    ['00000000-0000-0000-0000-000000000007', 'ovhcloud:openai/gpt-oss-120b', 'standard', 0.09],
  ];
  for (const [skuId, providerModelId, tier, inputUsd] of skus) {
    await db.query(
      `insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code, operation, status, display_name, service_tier_slug)
       values ($1, $2, $3, 'text.generate', 'active', 'Test SKU', $4)`,
      [skuId, providerModelId, `${providerModelId.replace(/[/]/g, '-')}:${tier}:${inputUsd}`, tier],
    );
    await db.query(
      `insert into public.v2_pricing_sku_meters (sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit, meter_order, metadata)
       values ($1, 'input_text_tokens', 'text', 'input', 'token', 1000000, $2, 'Input text tokens', '1M tokens', 100, '{"priority": 100}')`,
      [skuId, nanos(inputUsd)],
    );
  }
  await db.query(
    `insert into public.v2_pricing_sku_meters (sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit, meter_order)
     values ('00000000-0000-0000-0000-000000000005', 'cached_read_text_tokens', 'text', 'input', 'token', 1000000, $1, 'Cached input', '1M tokens', 300),
            ('00000000-0000-0000-0000-000000000006', 'cached_write_text_tokens_5m', 'text', 'input', 'token', 1000000, $2, '5m write', '1M tokens', 300),
            ('00000000-0000-0000-0000-000000000007', 'cached_read_text_tokens', 'text', 'input', 'token', 1000000, 0, 'Cached input', '1M tokens', 300),
            ('00000000-0000-0000-0000-000000000007', 'cached_write_text_tokens', 'text', 'input', 'token', 1000000, 0, 'Cache write', '1M tokens', 400)`,
    [nanos(0.3), nanos(2.75)],
  );

  const migration = await read('../migrations/20261017170000_add_missing_prompt_cache_prices.sql');
  const priceOf = async (skuId, meterKey) => {
    const { rows } = await db.query(
      'select price_nanos::float8 as price from public.v2_pricing_sku_meters where sku_id = $1 and meter_key = $2',
      [skuId, meterKey],
    );
    return rows[0] ? Math.round(rows[0].price) : null;
  };
  for (let run = 0; run < 2; run++) {
    await db.exec(migration);
    assert.equal(await priceOf('00000000-0000-0000-0000-000000000001', 'cached_read_text_tokens'), nanos(0.2));
    assert.equal(await priceOf('00000000-0000-0000-0000-000000000002', 'cached_read_text_tokens'), nanos(0.4));
    assert.equal(await priceOf('00000000-0000-0000-0000-000000000003', 'cached_read_text_tokens'), null, 'non-standard tiers keep the fallback');
    assert.equal(await priceOf('00000000-0000-0000-0000-000000000004', 'cached_read_text_tokens'), nanos(30));
    assert.equal(await priceOf('00000000-0000-0000-0000-000000000005', 'cached_read_text_tokens'), nanos(0.3), 'existing rows are kept');
    assert.equal(await priceOf('00000000-0000-0000-0000-000000000005', 'cached_write_text_tokens_5m'), nanos(3));
    assert.equal(await priceOf('00000000-0000-0000-0000-000000000005', 'cached_write_text_tokens_1h'), nanos(6));
    assert.equal(await priceOf('00000000-0000-0000-0000-000000000006', 'cached_write_text_tokens_1h'), nanos(4.4));
    assert.equal(await priceOf('00000000-0000-0000-0000-000000000007', 'cached_read_text_tokens'), nanos(0.09));
    assert.equal(await priceOf('00000000-0000-0000-0000-000000000007', 'cached_write_text_tokens'), nanos(0.09));
  }
  const { rows: [meta] } = await db.query(
    `select metadata from public.v2_pricing_sku_meters where sku_id = '00000000-0000-0000-0000-000000000001' and meter_key = 'cached_read_text_tokens'`,
  );
  assert.equal(meta.metadata.source_url, 'https://ai.google.dev/gemini-api/docs/pricing');
  assert.equal(meta.metadata.priority, 100);
  const { rows: [{ count }] } = await db.query('select count(*)::int as count from public.v2_pricing_sku_meters');
  assert.equal(count, 7 + 4 + 6);
  console.log('Prompt-cache price migration passed: ratio rows per SKU, existing rows kept, OVH $0 rows repriced, idempotent');
} finally {
  await db.close();
}
