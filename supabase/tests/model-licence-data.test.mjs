import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

try {
  for (const name of ['v2_labs', 'v2_models']) {
    const sql = await read(`../schemas/public/tables/${name}.sql`);
    await db.exec(sql.slice(0, sql.indexOf('\n);') + 3));
  }
  await db.exec(`
    insert into public.v2_labs (lab_slug, name) values ('qwen', 'Qwen'), ('anthropic', 'Anthropic'), ('meta', 'Meta'), ('cohere', 'Cohere');
    insert into public.v2_models (model_slug, lab_slug, name, license, license_url, variant_kind, base_model_slug) values
      -- spelling variants
      ('qwen/qwen3.6-27b', 'qwen', 'a', 'apache-2.0', null, 'standard', null),
      ('cohere/command-r', 'cohere', 'b', 'CC-BY-NC', null, 'standard', null),
      -- missing licences, one as an empty string, one with a URL already set
      ('qwen/qwen3-8b', 'qwen', 'c', null, null, 'standard', null),
      ('anthropic/claude-sonnet-5.5', 'anthropic', 'd', '  ', null, 'standard', null),
      ('qwen/qwen2.5-72b', 'qwen', 'e', null, 'https://example.com/licence', 'standard', null),
      -- an admin edit made after the audit is kept
      ('qwen/qwen3-32b', 'qwen', 'f', 'Custom', null, 'standard', null),
      -- "Open weights" gets the real licence
      ('meta/llama-3.3-70b-instruct', 'meta', 'g', 'Open weights', null, 'standard', null),
      -- free variants inherit from the base model
      ('qwen/qwen3-8b:free', 'qwen', 'h', null, null, 'free', 'qwen/qwen3-8b'),
      ('qwen/qwen3.6-27b:free', 'qwen', 'i', null, null, 'free', null),
      -- unknown models stay empty
      ('qwen/qwen3.8-flash', 'qwen', 'j', null, null, 'standard', null);
  `);

  const migration = await read('../migrations/20261020155924_fill_and_normalise_model_licences.sql');
  for (let run = 0; run < 2; run++) {
    await db.exec(migration);
    const { rows } = await db.query('select model_slug, license, license_url from public.v2_models order by model_slug');
    assert.deepEqual(rows, [
      { model_slug: 'anthropic/claude-sonnet-5.5', license: 'Proprietary', license_url: null },
      { model_slug: 'cohere/command-r', license: 'CC BY-NC 4.0', license_url: null },
      { model_slug: 'meta/llama-3.3-70b-instruct', license: 'Llama 3.3 Community License', license_url: 'https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct' },
      { model_slug: 'qwen/qwen2.5-72b', license: 'Qwen License', license_url: 'https://example.com/licence' },
      { model_slug: 'qwen/qwen3-32b', license: 'Custom', license_url: null },
      { model_slug: 'qwen/qwen3-8b', license: 'Apache 2.0', license_url: 'https://huggingface.co/Qwen/Qwen3-8B' },
      { model_slug: 'qwen/qwen3-8b:free', license: 'Apache 2.0', license_url: 'https://huggingface.co/Qwen/Qwen3-8B' },
      { model_slug: 'qwen/qwen3.6-27b', license: 'Apache 2.0', license_url: null },
      { model_slug: 'qwen/qwen3.6-27b:free', license: 'Apache 2.0', license_url: null },
      { model_slug: 'qwen/qwen3.8-flash', license: null, license_url: null },
    ]);
  }
  console.log('model licence data: ok');
} finally {
  await db.close();
}
