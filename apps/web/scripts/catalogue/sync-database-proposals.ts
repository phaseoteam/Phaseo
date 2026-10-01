import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { client } from "./database";
import { PRICING_TABLE_SOURCES } from "../../../api/src/pipeline/model-discovery/pricing-tables";
import { normalizeProviderModelPricing } from "../../../api/src/pipeline/model-discovery/pricing-normalizers";
import { extractOfficialPricing, type OfficialPriceCandidate } from "./sync-official-pricing";
import { fetchLiveDiscoveryRows } from "./sync-provider-discovery";
import { modelDevMeters } from "./sync-models-dev-pricing";

type Row = Record<string, any>;
const db = client();
async function all(table: string, order: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 500) {
    let query = db.from(table).select("*").order(order);
    if (table === "v2_route_capabilities") query = query.order("capability_id");
    const result = await query.range(from, from + 499);
    if (result.error) throw result.error;
    rows.push(...result.data ?? []);
    if ((result.data ?? []).length < 500) return rows;
  }
}
async function queue(route: string, code: string, proposalId: string | null, url: string, sku: Row | null, previous: Row | null) {
  if (process.argv.includes("--dry-run")) return;
  const result = await db.rpc("queue_v2_catalogue_price_proposal", { p_provider_model_id: route, p_sku_code: code, p_proposal_id: proposalId, p_source_url: url, p_sku: sku, p_expected_sku: previous });
  if (result.error) throw result.error;
}
async function main() {
  const filter = process.argv.find((arg) => arg.startsWith("--providers="))?.slice(12).split(",").filter(Boolean);
  const [routes, skus, rates, definitions, capabilities] = await Promise.all([all("v2_model_provider_routes", "provider_model_id"), all("v2_pricing_skus", "sku_id"), all("v2_pricing_sku_meters", "sku_meter_id"), all("v2_meter_definitions", "meter_key"), all("v2_route_capabilities", "provider_model_id")]);
  const candidates = new Map<string, { provider: string; candidate: OfficialPriceCandidate; url: string }>();
  const report: { proposed: number; equal: number; skipped: string[]; errors: string[] } = { proposed: 0, equal: 0, skipped: [], errors: [] };
  const add = (provider: string, candidate: OfficialPriceCandidate, url: string) => {
    if (filter?.length && !filter.includes(provider)) return;
    const key = `${provider}:${candidate.providerModel}:${candidate.capabilityId ?? "text.generate"}`;
    if (!candidates.has(key)) candidates.set(key, { provider, candidate, url });
  };
  for (const source of PRICING_TABLE_SOURCES.filter((s) => !filter?.length || filter.includes(s.providerId))) {
    try {
      const response = await fetch(source.sourceUrl, { headers: { Accept: "text/markdown, text/html" }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const extracted = extractOfficialPricing(source.providerId, await response.text());
      for (const candidate of extracted) {
        const peers = extracted.filter((row) => row.providerModel === candidate.providerModel && row.capabilityId === candidate.capabilityId);
        if (new Set(peers.map((row) => JSON.stringify([row.currency, row.meters, row.ruleOptions]))).size > 1) { report.skipped.push(`${source.providerId}/${candidate.providerModel}: ambiguous official prices`); continue; }
        add(source.providerId, candidate, source.sourceUrl);
      }
    } catch (error) { report.errors.push(`${source.providerId}: ${String(error)}`); }
  }
  const live = await fetchLiveDiscoveryRows();
  report.errors.push(...live.errors);
  for (const row of live.rows) {
    const normalized = normalizeProviderModelPricing(row.provider_id, row.model_details);
    if (normalized) add(row.provider_id, { providerModel: row.model_id, meters: normalized.meters, currency: "USD" }, row.source_url ?? "");
  }
  try {
    const response = await fetch("https://models.dev/api.json", { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as Row;
    for (const route of routes) {
      const cost = data[route.provider_slug]?.models?.[route.provider_model_slug]?.cost;
      const meters = cost ? modelDevMeters(cost) : null;
      // Fallback fills gaps only; direct feeds remain authoritative for existing prices.
      if (meters && !skus.some((sku) => sku.provider_model_id === route.provider_model_id && !sku.effective_to)) add(route.provider_slug, { providerModel: route.provider_model_slug, meters, currency: "USD" }, "https://models.dev/api.json");
    }
  } catch (error) { report.errors.push(`models.dev: ${String(error)}`); }
  for (const { provider, candidate, url } of candidates.values()) {
    const matched = routes.filter((route) => route.provider_slug === provider && route.provider_model_slug === candidate.providerModel && !route.is_stealth);
    if (matched.length !== 1) { report.skipped.push(`${provider}/${candidate.providerModel}: no unique public route`); continue; }
    const route = matched[0]; const operation = candidate.capabilityId ?? "text.generate";
    if (!capabilities.some((cap) => cap.provider_model_id === route.provider_model_id && cap.capability_id === operation && !cap.effective_to)) continue;
    const existing = skus.filter((sku) => sku.provider_model_id === route.provider_model_id && sku.operation === operation && !sku.effective_to && sku.status === "active");
    if (existing.length > 1 || existing.some((sku) => sku.service_tier_slug !== "standard" || sku.region || sku.route_variant_id || (Array.isArray(sku.metadata?.match) && sku.metadata.match.length > 0) || (Array.isArray(sku.metadata?.time_windows) && sku.metadata.time_windows.length > 0) || new Date(sku.effective_from) > new Date())) { report.skipped.push(`${route.provider_model_id}: complex or scheduled price group`); continue; }
    const previous = existing[0] ?? null;
    const meters: Row[] = [];
    for (const [meter_key, price] of Object.entries(candidate.meters)) {
      const definition = definitions.find((row) => row.meter_key === meter_key && row.status === "active");
      if (!definition || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(Math.round(price * 1000000000))) break;
      const options = candidate.ruleOptions?.[meter_key];
      meters.push({ meter_key, modality: definition.modality, direction: definition.direction, unit: options?.unit ?? "token", unit_quantity: options?.unitSize ?? 1000000, price_nanos: Math.round(price * 1000000000), display_label: definition.display_name, display_unit: `${options?.unitSize ?? 1000000} ${options?.unit ?? "tokens"}`, billable: true, metadata: {} });
    }
    const oldMeters = previous ? rates.filter((rate) => rate.sku_id === previous.sku_id) : [];
    if (meters.length !== Object.keys(candidate.meters).length || !meters.length || oldMeters.some((rate) => rate.billable === false || !meters.some((m) => m.meter_key === rate.meter_key) || Object.keys(rate.metadata ?? {}).some((key) => !["source", "source_key"].includes(key)))) { report.skipped.push(`${route.provider_model_id}: incomplete or conditional meter set`); continue; }
    if (previous && previous.currency === (candidate.currency ?? "USD") && oldMeters.length === meters.length && oldMeters.every((old) => meters.some((m) => m.meter_key === old.meter_key && m.price_nanos === Number(old.price_nanos) && m.unit_quantity === Number(old.unit_quantity) && m.unit === old.unit))) { await queue(route.provider_model_id, previous.sku_code, null, url, null, previous); report.equal++; continue; }
    const sku = { ...(previous ?? {}), sku_code: previous?.sku_code ?? `feed-${operation.replace(/[^a-z0-9._:-]/g, "-")}`, provider_model_id: route.provider_model_id, display_name: previous?.display_name ?? "Standard", operation, service_tier_slug: "standard", currency: candidate.currency ?? "USD", status: "active", meters, metadata: { ...(previous?.metadata ?? {}), source_url: url } };
    const proposal_id = createHash("sha256").update(JSON.stringify([route.provider_model_id, sku, previous])).digest("hex");
    await queue(route.provider_model_id, sku.sku_code, proposal_id, url, sku, previous);
    report.proposed++;
  }
  await mkdir(".sync", { recursive: true });
  await writeFile(".sync/database-catalog-sync.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ proposed: report.proposed, equal: report.equal, skipped: report.skipped.length, errors: report.errors.length }));
  if (report.errors.length && !candidates.size) throw new Error("Every provider source failed; see the sync report");
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
