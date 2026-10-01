import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createAdminClient } from "../apps/web/src/utils/supabase/admin";
import { deriveStatusFromDates, pickStatus } from "./update-model-statuses";
import { buildEnumSnapshot } from "../apps/web/scripts/catalogue/enumSnapshot";
for (const file of ["apps/web/.env.local", ".env.local", ".env"]) if (existsSync(file)) loadEnvFile(file);
async function main() {
  const db = createAdminClient();
  const tables = new Map<string, Record<string, any>[]>();
  for (const [table, key] of [["v2_models", "model_slug"], ["v2_model_provider_routes", "provider_model_id"]]) {
    const rows: Record<string, any>[] = [];
    for (let from = 0; ; from += 500) {
      const result = await db.from(table).select("*").order(key).range(from, from + 499);
      if (result.error) throw result.error;
      rows.push(...result.data ?? []);
      if ((result.data ?? []).length < 500) break;
    }
    tables.set(table, rows);
  }
  const active = new Set(buildEnumSnapshot(tables).callableModels);
  const labels = { rumoured: "Rumoured", announced: "Announced", limited_access: "Limited Access", withheld: "Withheld", available: "Available", deprecated: "Deprecated", retired: "Retired" } as const;
  const operational = (status: string) => status === "retired" || status === "deprecated" ? status : status === "withheld" ? "disabled" : ["rumoured", "announced"].includes(status) ? "draft" : "active";
  let changed = 0;
  for (const model of tables.get("v2_models") ?? []) {
    if (model.hidden) continue;
    const current = labels[model.catalogue_status as keyof typeof labels] ?? null;
    const derived = deriveStatusFromDates({ announced_date: model.announced_at, release_date: model.released_at, deprecation_date: model.deprecated_at, retirement_date: model.retired_at }, new Date(), active.has(model.model_slug));
    const next = pickStatus(current, derived);
    if (!next || next === current) continue;
    const catalogue_status = next.toLowerCase().replace(/ /g, "_");
    if (process.argv.includes("--dry-run")) { changed++; continue; }
    const values = { catalogue_status, updated_at: new Date().toISOString(), ...(model.status === operational(model.catalogue_status) ? { status: operational(catalogue_status) } : {}) };
    let query = db.from("v2_models").update(values).eq("model_slug", model.model_slug);
    query = model.updated_at ? query.eq("updated_at", model.updated_at) : query.is("updated_at", null);
    const result = await query.select("model_slug");
    if (result.error) throw result.error;
    changed += result.data?.length ?? 0;
  }
  console.log(`${process.argv.includes("--dry-run") ? "Proposed" : "Updated"} ${changed} database model statuses.`);
}
void main().catch((error) => { console.error(String(error)); process.exitCode = 1; });
