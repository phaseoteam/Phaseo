import { readFile } from "node:fs/promises";
import process from "node:process";

const root = new URL("../", import.meta.url);
const providerDir = new URL("packages/data/catalog/src/data/api_providers/huggingface/", root);
const [liveResponse, modelsText, ledgerText] = await Promise.all([
  fetch("https://router.huggingface.co/v1/models"),
  readFile(new URL("models.json", providerDir), "utf8"),
  readFile(new URL("router-audit-2026-08-24.json", providerDir), "utf8"),
]);

if (!liveResponse.ok) throw new Error(`Hugging Face router returned ${liveResponse.status}`);

const live = (await liveResponse.json()).data;
const catalog = JSON.parse(modelsText);
const ledger = JSON.parse(ledgerText);
const catalogIds = new Set(catalog.map(({ api_model_id }) => api_model_id));
const ledgerIds = new Set(ledger.entries.map(({ model_id }) => model_id));
const missingCatalog = live.map(({ id }) => id).filter((id) => !catalogIds.has(id));
const missingLedger = live.map(({ id }) => id).filter((id) => !ledgerIds.has(id));
const staleLedger = ledger.entries.map(({ model_id }) => model_id).filter((id) => !live.some(({ id: liveId }) => liveId === id));

for (const model of live) {
  console.log(`${model.id}\t${model.providers.map(({ provider }) => provider).join(",")}\t${catalogIds.has(model.id) ? "catalogued" : "missing"}`);
}

console.error(JSON.stringify({
  live: live.length,
  cataloguedLive: live.length - missingCatalog.length,
  ledger: ledger.entries.length,
  missingCatalog,
  missingLedger,
  staleLedger,
}, null, 2));

if (missingCatalog.length || missingLedger.length) process.exitCode = 1;
