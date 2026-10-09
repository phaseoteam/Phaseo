import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
try {
  for (const path of [
    './fixtures/staged-reporting-before.sql',
    '../migrations/20261009104347_exclude_staged_models_from_public_reporting.sql',
    '../migrations/20261009105347_admin_staged_model_release.sql',
    './staged_model_public_reporting.sql',
  ]) await db.exec(await readFile(new URL(path, import.meta.url), 'utf8'));
  console.log('Staged reporting exclusions and admin release contracts passed');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
