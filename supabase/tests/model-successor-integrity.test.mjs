import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const successor = async (slug) => (await rows('select replacement_model_slug as r from public.v2_models where model_slug = $1', [slug]))[0]?.r ?? null;
const setSuccessor = (slug, replacement) => db.query('update public.v2_models set replacement_model_slug = $2 where model_slug = $1', [slug, replacement]);

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
  await db.exec(`
    create schema private;
    create table public.v2_models (
      model_slug text primary key,
      replacement_model_slug text,
      updated_at timestamptz not null default now()
    );
    insert into public.v2_models (model_slug, replacement_model_slug) values
      ('minimax/speech-2.6-hd', 'minimax/speech-2.8'),
      ('minimax/speech-2.6-turbo', 'minimax/speech-2.8'),
      ('minimax/speech-2.8-hd', null),
      ('minimax/speech-2.8-turbo', null),
      ('google/gemini-omni-flash-preview', 'google/gemini-omni-1.1-flash'),
      ('google/gemini-omni-flash', null),
      ('lab/orphan', 'lab/missing'),
      ('lab/self', 'lab/self'),
      ('lab/a', null), ('lab/b', null), ('lab/c', null);
  `);
  const migration = await readFile(new URL('../migrations/20261015110100_model_successor_integrity.sql', import.meta.url), 'utf8');
  await db.exec(migration);

  assert.equal(await successor('minimax/speech-2.6-hd'), 'minimax/speech-2.8-hd');
  assert.equal(await successor('minimax/speech-2.6-turbo'), 'minimax/speech-2.8-turbo');
  assert.equal(await successor('google/gemini-omni-flash-preview'), 'google/gemini-omni-flash');
  assert.equal(await successor('lab/orphan'), null, 'dangling successors are cleared');
  assert.equal(await successor('lab/self'), null, 'self-references are cleared');

  // A chain is fine; closing it into a loop is not, however long the loop is.
  await setSuccessor('lab/a', 'lab/b');
  await setSuccessor('lab/b', 'lab/c');
  await assert.rejects(setSuccessor('lab/c', 'lab/a'), /would loop back to lab\/c/);
  await assert.rejects(setSuccessor('lab/c', 'lab/c'), /replacement_not_self_check|would loop back/);
  await assert.rejects(setSuccessor('lab/c', 'lab/missing'), /foreign key/);

  // A long chain that ends is accepted however many models it has.
  const chain = Array.from({ length: 40 }, (_, index) => `chain/m${String(index).padStart(2, '0')}`);
  await db.exec(`insert into public.v2_models (model_slug) values ${chain.map((slug) => `('${slug}')`).join(', ')}`);
  for (let index = chain.length - 2; index >= 0; index -= 1) await setSuccessor(chain[index], chain[index + 1]);
  assert.equal(await successor('chain/m00'), 'chain/m01');
  assert.equal(await successor('chain/m38'), 'chain/m39');
  // Prepending to the long chain walks all 40 models and still passes.
  await db.exec(`insert into public.v2_models (model_slug, replacement_model_slug) values ('chain/head', 'chain/m00')`);
  assert.equal(await successor('chain/head'), 'chain/m00');
  // Closing the 41-model chain into a loop is still caught at the far end.
  await assert.rejects(setSuccessor('chain/m39', 'chain/head'), /would loop back to chain\/m39/);
  await assert.rejects(setSuccessor('chain/m39', 'chain/m20'), /would loop back to chain\/m39/);
  assert.equal(await successor('chain/m39'), null);

  // A loop that already exists further along (written with the trigger off)
  // does not involve the edited model, so the walk stops instead of spinning.
  // Separate statements: the deferred foreign key leaves trigger events pending
  // within one multi-statement batch, which blocks the ALTER TABLE.
  await db.exec(`insert into public.v2_models (model_slug) values ('loop/x'), ('loop/y'), ('loop/entry')`);
  await db.exec('alter table public.v2_models disable trigger guard_replacement_cycle');
  await setSuccessor('loop/x', 'loop/y');
  await setSuccessor('loop/y', 'loop/x');
  await db.exec('alter table public.v2_models enable trigger guard_replacement_cycle');
  await setSuccessor('loop/entry', 'loop/x');
  assert.equal(await successor('loop/entry'), 'loop/x');

  // The foreign key is deferred, so a writer may point at a model it inserts later in the same transaction.
  await db.exec(`
    begin;
    insert into public.v2_models (model_slug, replacement_model_slug) values ('lab/old', 'lab/new');
    insert into public.v2_models (model_slug) values ('lab/new');
    commit;
  `);
  assert.equal(await successor('lab/old'), 'lab/new');
  console.log('model successor integrity: ok');
} finally {
  await db.close();
}
