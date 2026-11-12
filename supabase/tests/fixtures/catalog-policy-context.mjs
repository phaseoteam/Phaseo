import { readFile } from 'node:fs/promises';

// Minimal source/approval relations for isolated context tests. Execute the real
// resolver; full constraints, grants, audit and promotion are tested by SQL replay.
export async function installCatalogPolicyContext(db) {
  await db.exec(`
    create table public.provider_catalog_sources (
      provider_slug text primary key, catalog_url text, management_mode text,
      status text, last_success_at timestamptz);
    create table public.provider_catalog_policy_approvals (
      provider_slug text primary key, enabled boolean, catalog_url text,
      management_mode text, privacy_policy_url text);
  `);
  await db.exec(await readFile(new URL('../../schemas/public/functions/resolve_catalog_data_policy.sql', import.meta.url), 'utf8'));
}
