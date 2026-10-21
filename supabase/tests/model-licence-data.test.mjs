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

  await db.exec(`
    delete from public.v2_models;
    insert into public.v2_labs (lab_slug, name) values ('tencent', 'Tencent'), ('google', 'Google'), ('z-ai', 'Z.ai'), ('deepseek', 'DeepSeek');
    insert into public.v2_models (model_slug, lab_slug, name, license, license_url, variant_kind, base_model_slug) values
      -- wrong licence corrected; the preview keeps its own licence under the new name
      ('tencent/hy3', 'tencent', 'a', 'Tencent Hy Community License Agreement', null, 'standard', null),
      ('tencent/hy3-preview', 'tencent', 'b', 'Tencent Hy Community License Agreement', null, 'standard', null),
      -- "Open weights" gets the real licence
      ('z-ai/glm-5.2-fast', 'z-ai', 'c', 'Open weights', null, 'standard', null),
      -- an admin edit made after the audit is kept
      ('deepseek/deepseek-chat', 'deepseek', 'd', 'Custom', null, 'standard', null),
      -- missing licence filled
      ('deepseek/deepseek-v4.1-flash-fast', 'deepseek', 'e', null, null, 'standard', null),
      -- renames, with the Health AI terms link added
      ('google/gemma-3-27b-it', 'google', 'f', 'Gemma', 'https://example.com/gemma', 'standard', null),
      ('google/medgemma-1.5-4b', 'google', 'g', 'Google Health AI', null, 'standard', null);
  `);
  const tidy = await read('../migrations/20261021090011_tidy_model_licence_names.sql');
  for (let run = 0; run < 2; run++) {
    await db.exec(tidy);
    const { rows } = await db.query('select model_slug, license, license_url from public.v2_models order by model_slug');
    assert.deepEqual(rows, [
      { model_slug: 'deepseek/deepseek-chat', license: 'Custom', license_url: null },
      { model_slug: 'deepseek/deepseek-v4.1-flash-fast', license: 'MIT', license_url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash' },
      { model_slug: 'google/gemma-3-27b-it', license: 'Gemma Terms of Use', license_url: 'https://example.com/gemma' },
      { model_slug: 'google/medgemma-1.5-4b', license: 'Health AI Developer Foundations Terms', license_url: 'https://developers.google.com/health-ai-developer-foundations/terms' },
      { model_slug: 'tencent/hy3', license: 'Apache 2.0', license_url: 'https://huggingface.co/tencent/Hy3/blob/main/LICENSE' },
      { model_slug: 'tencent/hy3-preview', license: 'Tencent Hy Community License', license_url: null },
      { model_slug: 'z-ai/glm-5.2-fast', license: 'MIT', license_url: 'https://huggingface.co/zai-org/GLM-5.2' },
    ]);
  }
  console.log('model licence data: ok');
} finally {
  await db.close();
}
