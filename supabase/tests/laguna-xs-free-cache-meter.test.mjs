import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL(
  '../migrations/20260921075536_add_laguna_xs_free_cache_meter.sql', import.meta.url,
), 'utf8');

test('adds only the missing active XS free meter and is safe to replay', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table v2_pricing_skus (
        sku_id text primary key, provider_model_id text, operation text,
        service_tier_slug text, status text, effective_from timestamptz,
        effective_to timestamptz
      );
      create table v2_pricing_sku_meters (
        sku_id text references v2_pricing_skus, meter_key text, modality text,
        direction text, unit text, unit_quantity bigint, price_nanos bigint,
        display_label text, display_unit text, billable boolean,
        meter_order int, metadata jsonb, unique (sku_id, meter_key)
      );
    `);
    // An empty catalogue must also be safe during a fresh installation.
    await db.exec(migration);
    for (const id of ['target', 'existing', 'paid', 'retired', 'future', 'ended', 'other', 'nonzero', 'incomplete', 'operation']) {
      await db.query(`insert into v2_pricing_skus values (
        $1, $2, $3, $4, $5,
        now() + ($6::int * interval '1 day'),
        case when $1 = 'ended' then now() - interval '1 day' else null end
      )`, [id, id === 'other' ? 'poolside:poolside/laguna-s-2.1:free' : 'poolside:poolside/laguna-xs-2.1:free',
        id === 'operation' ? 'image.generate' : 'text.generate',
        id === 'paid' ? 'standard' : 'free', id === 'retired' ? 'retired' : 'active',
        id === 'future' ? 1 : -2]);
      for (const meter of ['input_text_tokens', 'output_text_tokens']) {
        if (id === 'incomplete' && meter === 'output_text_tokens') continue;
        await db.query(`insert into v2_pricing_sku_meters (
          sku_id, meter_key, unit, unit_quantity, price_nanos, billable
        ) values ($1, $2, 'token', 1000000, $3, true)`, [id, meter, id === 'nonzero' ? 1 : 0]);
      }
    }
    await db.exec(`insert into v2_pricing_sku_meters (sku_id, meter_key, price_nanos)
      values ('existing', 'cached_read_text_tokens', 123)`);
    const before = (await db.query('select * from v2_pricing_sku_meters order by sku_id, meter_key')).rows;
    await db.exec(migration);
    const rows = (await db.query('select * from v2_pricing_sku_meters order by sku_id, meter_key')).rows;
    const added = rows.filter(row => row.sku_id === 'target' && row.meter_key === 'cached_read_text_tokens');
    assert.equal(added.length, 1);
    assert.equal(Number(added[0].price_nanos), 0);
    assert.equal(Number(added[0].unit_quantity), 1000000);
    assert.equal(added[0].unit, 'token');
    assert.equal(added[0].billable, true);
    assert.equal(added[0].direction, 'input');
    assert.equal(added[0].modality, 'text');
    assert.deepEqual(rows.filter(row => !added.includes(row)), before);
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from v2_pricing_sku_meters order by sku_id, meter_key')).rows, rows);
  } finally {
    await db.close();
  }
});
