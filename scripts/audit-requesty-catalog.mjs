import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCanonicalModelId, resolveCatalogPath } from "./catalog-path-safety.mjs";

const ROOT = path.resolve(import.meta.dirname, "../packages/data/catalog/src/data");
const URL = "https://router.requesty.ai/v1/models";
const CHECKED = "2026-08-24T00:00:00Z";
const LAB_ALIASES = { alibaba: "qwen", moonshot: "moonshotai", zai: "z-ai", xai: "spacex-ai", thinkingmachines: "thinking-machines", nousresearch: "nous" };
const MODEL_ALIASES = { "openai/gpt-4o-2024-11-20": "openai/gpt-4o" };
const title = value => value.replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const slug = value => value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "");
const json = value => JSON.stringify(value, null, 2) + "\n";
const safePathParts = value => {
  const parts = String(value).split("/");
  if (parts.length < 2 || parts.some(part => !/^[a-z0-9][a-z0-9._:@-]{0,127}$/i.test(part) || part === "." || part === "..")) {
    throw new Error(`Unsafe remote model id: ${value}`);
  }
  return parts;
};
async function files(root, name, out = []) { for (const entry of await readdir(root, { withFileTypes: true })) { const p = path.join(root, entry.name); if (entry.isDirectory()) await files(p, name, out); else if (entry.name === name) out.push(p); } return out; }
async function put(file, value) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, json(value)); }

const response = await fetch(URL);
if (!response.ok) throw new Error(`Requesty models HTTP ${response.status}`);
const rows = (await response.json()).data;
const existingModels = new Map();
for (const file of await files(path.join(ROOT, "models"), "model.json")) { const value = JSON.parse(await readFile(file, "utf8")); existingModels.set(value.model_id, value); }
const tails = new Map();
for (const id of existingModels.keys()) { const tail = id.split("/").slice(1).join("/"); tails.set(tail, [...(tails.get(tail) ?? []), id]); }
const organisations = new Set((await readdir(path.join(ROOT, "organisations"), { withFileTypes: true })).filter(x => x.isDirectory()).map(x => x.name));
const canonical = new Map();
for (const row of rows) {
  const lab = LAB_ALIASES[row.model_lab] ?? row.model_lab;
  const exact = `${lab}/${row.model_canonical_name}`;
  const tailMatches = tails.get(String(row.model_canonical_name).toLowerCase()) ?? [];
  const id = MODEL_ALIASES[exact] ?? (existingModels.has(exact) ? exact : tailMatches.length === 1 ? tailMatches[0] : exact);
  const [org, modelId] = parseCanonicalModelId(id);
  canonical.set(row.id, id);
  if (!organisations.has(org)) {
    organisations.add(org);
    await put(resolveCatalogPath(ROOT, "organisations", org, "organisation.json"), { organisation_id: org, name: title(org), country_code: null, description: `Model developer identified by Requesty's official model catalogue.`, link: URL, aliases: [], sources: [{ kind: "provider_models", url: URL, accessed_at: CHECKED, notes: "Developer attribution from Requesty's live catalogue." }], verification: { status: "partial", checked_at: CHECKED, notes: "Requesty catalogue attribution; independent developer metadata remains to be enriched." } });
  }
  if (!existingModels.has(id)) {
    safePathParts(id);
    const modalities = row.supports_vision ? ["text", "image"] : ["text"];
    const created = Number.isFinite(row.created) ? new Date(row.created * 1000).toISOString() : null;
    const model = { model_id: id, organisation_id: org, name: title(row.model_canonical_name), status: "Available", previous_model_id: null, description: row.description ?? null, announced_date: created, release_date: created, deprecation_date: null, retirement_date: null, license: row.open_weights ? "Open weights" : "Proprietary", input_types: modalities.join(","), output_types: row.supports_image_generation ? "text,image" : "text", api_model_id: id, links: [{ title: "Requesty model catalogue", kind: "api_reference", url: URL }], details: [{ name: "requesty_availability", value: `Available through Requesty as ${row.id}.` }], benchmarks: [], family_id: null, page_notice: null, model_type: null, knowledge_cutoff: null, limits: { context: row.context_window ?? null, input: row.context_window ?? null, output: row.max_output_tokens ?? null }, modalities: { input: modalities, output: row.supports_image_generation ? ["text", "image"] : ["text"] }, reasoning: { supported: row.supports_reasoning ?? null, options: [] }, capabilities: { attachment: row.supports_vision ?? null, tool_call: row.supports_tool_calling ?? null, structured_output: Boolean(row.supports_output_json_object || row.supports_output_json_schema), temperature: null, streaming: true, web_search: row.supports_web_search ?? null }, open_weights: row.open_weights ?? null, sources: [{ kind: "provider_models", url: URL, accessed_at: CHECKED, notes: "Canonical name, developer, lifecycle timestamp, limits, modalities, and capabilities from Requesty's live catalogue." }], verification: { status: "partial", checked_at: CHECKED, notes: "Available in Requesty's official live catalogue; third-party developer metadata may require further enrichment." }, last_updated: Number.isFinite(row.updated) ? new Date(row.updated * 1000).toISOString() : null, removal_date: null, replacement_model_id: null, license_url: null };
    existingModels.set(id, model); await put(resolveCatalogPath(ROOT, "models", org, modelId, "model.json"), model);
  }
}

const oldRoutes = JSON.parse(await readFile(path.join(ROOT, "api_providers/requesty/models.json"), "utf8"));
const oldBySlug = new Map(oldRoutes.map(x => [x.provider_model_slug, x]));
const routes = rows.map(row => {
  const id = canonical.get(row.id); safePathParts(id); const old = oldBySlug.get(row.id); const region = row.id.includes("@") ? row.id.split("@").at(-1) : row.geolocation;
  return { ...(old ?? {}), api_model_id: id, provider_api_model_id: `requesty:${row.id}`, provider_model_slug: row.id, internal_model_id: id, is_active_gateway: false, quantization_scheme: old?.quantization_scheme ?? null, input_modalities: row.supports_vision ? "text,image" : "text", output_modalities: row.supports_image_generation ? "text,image" : "text", context_length: row.context_window ?? null, max_output_tokens: row.max_output_tokens ?? null, effective_from: Number.isFinite(row.created) ? new Date(row.created * 1000).toISOString() : null, effective_to: null, capabilities: [{ capability_id: "text.generate", status: "active", params: [], reasoning: row.supports_reasoning ?? null, tool_call: row.supports_tool_calling ?? null, structured_output: Boolean(row.supports_output_json_object || row.supports_output_json_schema), temperature: null, attachment: row.supports_vision ?? null, input_modalities: row.supports_vision ? ["text", "image"] : ["text"], output_modalities: row.supports_image_generation ? ["text", "image"] : ["text"], modes: [] }], routing_status: "active", routable: false, regions: { execution: region ? [region] : ["global"], data: region ? [region] : ["global"] }, service_tiers: row.id.includes(":flex") ? ["flex"] : row.id.includes(":priority") ? ["priority"] : ["standard"], api: { formats: ["openai-chat-completions"], endpoint: "/chat/completions", deployment: null }, data_retention: row.data_retention ?? null, data_retention_days: row.data_retention_days ?? null, data_used_for_training: row.data_used_for_training ?? null, privacy_comments: row.privacy_comments ?? null, sources: [{ kind: "provider_models", url: URL, accessed_at: CHECKED, notes: "Exact live route, limits, modalities, lifecycle, privacy flags, and availability." }], verification: { status: "verified", checked_at: CHECKED, notes: "Reconciled against Requesty's public live catalogue." }, rate_limits: [] };
});
for (const old of oldRoutes) if (!rows.some(row => row.id === old.provider_model_slug)) routes.push({ ...old, routing_status: "inactive", effective_to: old.effective_to ?? CHECKED, verification: { status: "verified", checked_at: CHECKED, notes: "Preserved as history; absent from Requesty's live catalogue on the audit date." } });
routes.sort((a,b) => a.provider_model_slug.localeCompare(b.provider_model_slug));
await put(path.join(ROOT, "api_providers/requesty/models.json"), routes);

const grouped = new Map(); for (const row of rows) grouped.set(canonical.get(row.id), [...(grouped.get(canonical.get(row.id)) ?? []), row]);
for (const [id, variants] of grouped) {
  const rules = [];
  for (const row of variants) for (const tier of row.pricing ?? []) {
    const match = [{ field: "provider_model_slug", operator: "eq", value: row.id }];
    if ((tier.prompt_tokens_threshold ?? 0) > 0) match.push({ field: "input_text_tokens", operator: "gte", value: tier.prompt_tokens_threshold });
    const plan = row.id.includes(":flex") ? "flex" : row.id.includes(":priority") ? "priority" : "standard";
    for (const [meter, field] of [["input_text_tokens","input_price"],["cached_read_text_tokens","cached_price"],["output_text_tokens","output_price"]]) if (Number.isFinite(tier[field])) rules.push({ meter, unit: "token", unit_size: 1000000, price_per_unit: tier[field] * 1000000, currency: "USD", pricing_plan: plan, note: `Requesty route ${row.id}; threshold ${tier.prompt_tokens_threshold ?? 0}.`, match, priority: 100 + (tier.prompt_tokens_threshold ?? 0), effective_from: null, region: null, cache_duration_seconds: null, conditions: match, source: { kind: "provider_models", url: URL, accessed_at: CHECKED, notes: "Exact live Requesty pricing tier." } });
  }
  await put(path.join(ROOT, "pricing/requesty", slug(id), "text.generate/pricing.json"), { key: `requesty:${id}:text.generate`, api_provider_id: "requesty", provider_slug: "requesty", api_model_id: id, capability_id: "text.generate", rules, regions: [], service_tiers: [...new Set(rules.map(x => x.pricing_plan))], sources: [{ kind: "provider_models", url: URL, accessed_at: CHECKED, notes: "Complete live route and threshold pricing." }], verification: { status: "verified", checked_at: CHECKED, notes: `${variants.length} Requesty route(s), all pricing tiers reconciled.` } });
}
console.log(json({ live: rows.length, preservedHistory: routes.length - rows.length, canonicalModels: new Set(canonical.values()).size, pricingFiles: grouped.size }));
