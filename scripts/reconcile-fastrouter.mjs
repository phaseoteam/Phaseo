import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("packages/data/catalog/src/data");
const sourceUrl = "https://go.fastrouter.ai/api/v1/models";
const checkedAt = "2026-08-24T00:29:58.321Z";
const payload = await fetch(sourceUrl).then((response) => response.json());
const providerPath = path.join(root, "api_providers/fastrouter/models.json");
const routes = JSON.parse(await readFile(providerPath, "utf8"));
const mapped = new Set(routes.map((route) => route.provider_model_slug.toLowerCase()));

const exclusions = new Map([
  ["fastrouter/auto", "dynamic router, not a standalone model"],
  ["anthropic/claude-4.5-sonnet", "alias spelling of anthropic/claude-sonnet-4.5"],
  ["openai/o3-mini-high", "reasoning-effort preset for openai/o3-mini"],
  ["openai/o4-mini-high", "reasoning-effort preset for openai/o4-mini"],
  ["minimax/minimax-m2.7-highspeed", "throughput tier for minimax/minimax-m2.7"],
  ["x-ai/grok-imagine-image-quality", "quality preset for x-ai/grok-imagine-image"],
]);

const orgAliases = {
  "ace-step": "ace-step", "anthropic": "anthropic", "black-forest-labs": "black-forest-labs",
  "bytedance": "bytedance", "deepinfra": "deepinfra", "deepseek-ai": "deepseek", "google": "google",
  "kling-ai": "kling-ai", "leonardo-ai": "leonardo-ai", "meta-llama": "meta", "minimax": "minimax",
  "mistralai": "mistral", "nvidia": "nvidia", "openai": "openai", "perplexity": "perplexity",
  "pika": "pika", "pollo": "pollo", "qwen": "qwen", "runway": "runway", "sarvam": "sarvam",
  "vidu": "vidu", "wanx": "alibaba", "x-ai": "spacex-ai", "z-image": "qwen",
};
const creatorNames = {
  "ace-step": "ACE-Step", deepinfra: "DeepInfra", "kling-ai": "Kling AI", "leonardo-ai": "Leonardo.AI",
  pika: "Pika", pollo: "Pollo AI", sarvam: "Sarvam AI", vidu: "Vidu",
};
const manual = new Map([
  ["qwen/qwen2.5-72b-instruct", "qwen/qwen2.5-72b"], ["qwen/qwen2.5-7b-instruct", "qwen/qwen2.5-7b"],
  ["black-forest-labs/flux-kontext-pro", "black-forest-labs/flux-1-kontext-pro"],
  ["deepseek-ai/deepseek-r1", "deepseek/deepseek-r1"],
  ["deepseek-ai/deepseek-r1-distill-llama-70b", "deepseek/deepseek-r1-distill-llama-70b"],
  ["google/gemma-4-26b-a4b-it", "google/gemma-4-26b-a4b"], ["google/gemma-4-31b-it", "google/gemma-4-31b-it"],
  ["meta-llama/llama-3.1-8b-instant", "meta/llama-3.1-8b"], ["meta-llama/llama-4-scout-17b-16e-instruct", "meta/llama-4-scout"],
  ["minimax/minimax-h3", "minimax/h3"], ["mistralai/mistral-nemo-instruct-2407", "mistral/mistral-nemo-2407"],
  ["mistralai/mistral-small-24b-instruct-2501", "mistral/mistral-small-24b-2501"], ["mistralai/mixtral-8x7b-instruct-v0.1", "mistral/mixtral-8x7b"],
  ["openai/gpt-3.5-turbo-1106", "openai/gpt-3.5-turbo"], ["openai/gpt-4o-mini-2024-07-18", "openai/gpt-4o-mini"],
  ["openai/omni-moderation-latest", "openai/omni-moderation"], ["qwen/qwen2.5-vl-32b-instruct", "qwen/qwen2.5-vl-32b-instruct"],
]);

const canonicalIds = new Set();
async function walk(dir, filename, output = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, filename, output);
    else if (entry.name === filename) output.push(full);
  }
  return output;
}
for (const file of await walk(path.join(root, "models"), "model.json")) {
  canonicalIds.add(JSON.parse(await readFile(file, "utf8")).model_id.toLowerCase());
}

function title(value) { return value.split(/[._/-]+/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" "); }
function capability(model) {
  if (model.id.includes("whisper") || model.id.includes("saaras")) return "audio.transcribe";
  const output = model.architecture?.output_modalities ?? [];
  if (output.includes("video")) return "video.generate";
  if (output.includes("image")) return "image.generate";
  if (output.includes("audio")) return "audio.generate";
  if (model.id.includes("embedding") || model.id.includes("e5-")) return "text.embed";
  if (model.id.includes("moderation")) return "text.moderate";
  return "text.generate";
}
function canonicalId(model) {
  const lower = model.id.toLowerCase();
  if (manual.has(lower)) return manual.get(lower);
  const [vendor, ...tail] = lower.split("/");
  return `${orgAliases[vendor] ?? vendor}/${tail.join("/").replaceAll(":", "-")}`;
}
function rule(meter, unit, unitSize, price, note = null, conditions = []) {
  return { meter, unit, unit_size: unitSize, price_per_unit: price, currency: "USD", pricing_plan: "standard", note,
    match: conditions, priority: 100, region: null, cache_duration_seconds: null, conditions, source: sourceUrl };
}
function pricingRules(model, cap) {
  const p = model.pricing ?? {}; const out = [];
  const number = (value) => value !== "" && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  const token = [["input_text_tokens", p.prompt], ["output_text_tokens", p.completion], ["cached_read_text_tokens", p.input_cache_read], ["cached_write_text_tokens", p.input_cache_write], ["input_audio_tokens", p.audio_input], ["output_audio_tokens", p.audio_output], ["cached_read_audio_tokens", p.cached_audio_input], ["input_video_tokens", p.video]];
  for (const [meter, value] of token) if (number(value) !== null) out.push(rule(meter, "token", 1_000_000, number(value) * 1_000_000));
  if (number(p.request) !== null && number(p.request) !== 0) out.push(rule("requests", "request", 1, number(p.request)));
  if (number(p.image) !== null) out.push(rule("output_image", "image", 1, number(p.image)));
  if (number(p.audio_output_per_minute) !== null) out.push(rule("output_audio_seconds", "second", 1, number(p.audio_output_per_minute) / 60));
  const videoRows = (rows, audio) => Array.isArray(rows) && rows.forEach((row) => {
    const length = number(row.length) || 1;
    for (const [resolution, value] of Object.entries(row)) {
      if (["length", "default", "x-key"].includes(resolution) || number(value) === null) continue;
      const conditions = [{ path: "video_params.resolution", op: "eq", or_group: 1, and_index: 1, value: resolution }];
      if (audio !== null) conditions.push({ path: "video_params.audio", op: "eq", or_group: 1, and_index: 2, value: audio });
      out.push(rule("output_video_seconds", "second", 1, number(value) / length, null, conditions));
    }
    if (number(row.default) !== null && Object.keys(row).every((key) => ["length", "default", "x-key"].includes(key))) out.push(rule("output_video_seconds", "second", 1, number(row.default) / length));
  });
  videoRows(p.videoCost, false); videoRows(p.videoCostWithAudio, true);
  const imageRows = Array.isArray(p.imageCost) ? p.imageCost : Array.isArray(p.priceToShow?.imageCost) ? p.priceToShow.imageCost : [];
  for (const row of imageRows) {
    const price = number(row.default ?? row.price);
    if (price === null) continue;
    const conditions = row.size ? [{ path: "image_params.size", op: "eq", or_group: 1, and_index: 1, value: row.size }] : [];
    out.push(rule("output_image", "image", 1, price, null, conditions));
  }
  if (cap === "video.generate" && out.length === 0 && number(p.duration) !== null) out.push(rule("output_video_seconds", "second", 1, number(p.duration)));
  return out;
}

const reconciliation = { mapped: [], excluded: [], createdModels: [], createdOrganisations: [] };
for (const model of payload.data) {
  const lower = model.id.toLowerCase();
  if (mapped.has(lower)) continue;
  if (lower.endsWith(":free")) { reconciliation.excluded.push({ id: model.id, reason: "free service-tier alias" }); continue; }
  if (exclusions.has(lower)) { reconciliation.excluded.push({ id: model.id, reason: exclusions.get(lower) }); continue; }
  const id = canonicalId(model); const org = id.split("/")[0]; const cap = capability(model);
  const orgPath = path.join(root, "organisations", org, "organisation.json");
  try { await readFile(orgPath); } catch {
    await mkdir(path.dirname(orgPath), { recursive: true });
    await writeFile(orgPath, JSON.stringify({ organisation_id: org, name: creatorNames[org] ?? title(org), country_code: null,
      description: `${creatorNames[org] ?? title(org)} publishes AI models available through FastRouter.`, colour: null,
      organisation_links: [], status: "active", routable: null, sources: [{ kind: "provider_models", url: sourceUrl, accessed_at: checkedAt, notes: `FastRouter identifies ${model.creator} as the model creator.` }],
      verification: { status: "partial", checked_at: checkedAt, notes: "Identity verified from FastRouter's official live model catalogue." } }, null, 2) + "\n");
    reconciliation.createdOrganisations.push(org);
  }
  if (!canonicalIds.has(id)) {
    const modelPath = path.join(root, "models", ...id.split("/"), "model.json");
    await mkdir(path.dirname(modelPath), { recursive: true });
    const inputs = model.architecture?.input_modalities ?? []; const outputs = model.architecture?.output_modalities ?? [];
    await writeFile(modelPath, JSON.stringify({ model_id: id, organisation_id: org, name: model.name, status: model.is_active ? "Available" : "Unavailable", previous_model_id: null,
      description: model.description || `${model.name} is an AI model published by ${model.creator}.`, announced_date: null, release_date: model.created ? new Date(model.created * 1000).toISOString().slice(0, 19) : null,
      deprecation_date: null, retirement_date: null, license: null, input_types: inputs.join(",") || null, output_types: outputs.join(",") || null, api_model_id: id,
      links: [{ title: "FastRouter model catalogue", kind: "api_reference", url: sourceUrl }], details: [], benchmarks: [], family_id: null, page_notice: null,
      model_type: outputs.includes("video") ? "video" : outputs.includes("image") ? "image" : outputs.includes("audio") ? "audio" : null, knowledge_cutoff: null,
      limits: { context: model.context_length ?? null, input: null, output: model.top_provider?.max_completion_tokens ?? null },
      modalities: { input: inputs.map((v) => v === "image" || v === "audio" || v === "video" ? `${v}/*` : v), output: outputs.map((v) => v === "image" || v === "audio" || v === "video" ? `${v}/*` : v) },
      reasoning: { supported: model.supported_parameters?.includes("reasoning") ?? null, options: [] }, capabilities: { attachment: inputs.some((v) => ["image","audio","video","file"].includes(v)), tool_call: model.supported_parameters?.includes("tools") ?? null,
        structured_output: model.supported_parameters?.some((v) => ["structured_outputs","response_format","response_schema"].includes(v)) ?? null, temperature: model.supported_parameters?.includes("temperature") ?? null,
        streaming: model.supported_parameters?.includes("stream") ?? null, web_search: model.supported_parameters?.some((v) => v.includes("web_search")) ?? null }, open_weights: null,
      sources: [{ kind: "provider_models", url: sourceUrl, accessed_at: checkedAt, notes: "Exact identity, creator, description, lifecycle, limits, modalities, and parameters from FastRouter's live catalogue." }],
      verification: { status: "partial", checked_at: checkedAt, notes: "Provider-offer identity and technical metadata verified from FastRouter; upstream creator documentation was not independently re-verified." },
      last_updated: checkedAt.slice(0, 19), removal_date: null, replacement_model_id: null, license_url: null }, null, 2) + "\n");
    canonicalIds.add(id); reconciliation.createdModels.push(id);
  }
  const inputs = model.architecture?.input_modalities ?? []; const outputs = model.architecture?.output_modalities ?? [];
  routes.push({ api_model_id: id, provider_api_model_id: `fastrouter:${id}`, provider_model_slug: model.id, internal_model_id: id, is_active_gateway: false,
    quantization_scheme: null, input_modalities: inputs.join(",") || null, output_modalities: outputs.join(",") || null, context_length: model.context_length ?? null,
    max_output_tokens: model.top_provider?.max_completion_tokens ?? null, effective_from: null, effective_to: null,
    capabilities: [{ capability_id: cap, status: model.is_active ? "active" : "disabled", params: model.supported_parameters ?? [], reasoning: model.supported_parameters?.includes("reasoning") ?? null,
      tool_call: model.supported_parameters?.includes("tools") ?? null, structured_output: model.supported_parameters?.some((v) => ["structured_outputs","response_format","response_schema"].includes(v)) ?? null,
      temperature: model.supported_parameters?.includes("temperature") ?? null, attachment: inputs.some((v) => ["image","audio","video","file"].includes(v)), input_modalities: null, output_modalities: null, modes: [] }],
    routing_status: model.is_active ? "active" : "disabled", routable: false, regions: { execution: ["global"], data: ["global"] }, service_tiers: [], api: { formats: [], endpoint: null, deployment: null },
    sources: [{ kind: "provider_models", url: sourceUrl, accessed_at: checkedAt, notes: "Exact FastRouter route metadata." }], verification: { status: "verified", checked_at: checkedAt, notes: "Exact route identity and availability verified against FastRouter's live catalogue; Phaseo routing remains disabled." }, rate_limits: [] });
  const rules = pricingRules(model, cap);
  if (rules.length) {
    const pricingPath = path.join(root, "pricing/fastrouter", id.replace(/[^a-z0-9._-]+/gi, "-"), cap, "pricing.json");
    try { await readFile(pricingPath); } catch {
      await mkdir(path.dirname(pricingPath), { recursive: true });
      await writeFile(pricingPath, JSON.stringify({ key: `fastrouter:${id}:${cap}`, api_provider_id: "fastrouter", provider_slug: "fastrouter", api_model_id: id, capability_id: cap,
        rules, regions: [], service_tiers: ["standard"], sources: [{ kind: "provider_models", url: sourceUrl, accessed_at: checkedAt, notes: "Published FastRouter list pricing." }],
        verification: { status: "verified", checked_at: checkedAt, notes: "Structured from FastRouter's live published pricing metadata." } }, null, 2) + "\n");
    }
  }
  reconciliation.mapped.push({ id: model.id, canonical: id, capability: cap, priced: rules.length > 0 });
}
for (const model of payload.data) {
  const route = routes.find((candidate) => candidate.provider_model_slug.toLowerCase() === model.id.toLowerCase());
  if (!route) continue;
  const cap = capability(model); const inputs = model.architecture?.input_modalities ?? []; const outputs = model.architecture?.output_modalities ?? [];
  route.input_modalities = inputs.join(",") || null; route.output_modalities = outputs.join(",") || null;
  route.context_length = model.context_length ?? route.context_length; route.max_output_tokens = model.top_provider?.max_completion_tokens ?? route.max_output_tokens;
  route.capabilities = [{ capability_id: cap, status: model.is_active ? "active" : "disabled", params: model.supported_parameters ?? [],
    reasoning: model.supported_parameters?.includes("reasoning") ?? null, tool_call: model.supported_parameters?.includes("tools") ?? null,
    structured_output: model.supported_parameters?.some((v) => ["structured_outputs","response_format","response_schema"].includes(v)) ?? null,
    temperature: model.supported_parameters?.includes("temperature") ?? null, attachment: inputs.some((v) => ["image","audio","video","file"].includes(v)), input_modalities: null, output_modalities: null, modes: [] }];
  route.routing_status = model.is_active ? "active" : "disabled";
  const rules = pricingRules(model, cap);
  if (!rules.length) continue;
  const pricingPath = path.join(root, "pricing/fastrouter", route.api_model_id.replace(/[^a-z0-9._-]+/gi, "-"), cap, "pricing.json");
  try { await readFile(pricingPath); } catch {
    await mkdir(path.dirname(pricingPath), { recursive: true });
    await writeFile(pricingPath, JSON.stringify({ key: `fastrouter:${route.api_model_id}:${cap}`, api_provider_id: "fastrouter", provider_slug: "fastrouter", api_model_id: route.api_model_id, capability_id: cap,
      rules, regions: [], service_tiers: ["standard"], sources: [{ kind: "provider_models", url: sourceUrl, accessed_at: checkedAt, notes: "Published FastRouter list pricing." }],
      verification: { status: "verified", checked_at: checkedAt, notes: "Structured from FastRouter's live published pricing metadata." } }, null, 2) + "\n");
  }
}
routes.sort((a, b) => a.api_model_id.localeCompare(b.api_model_id) || a.provider_model_slug.localeCompare(b.provider_model_slug));
await writeFile(providerPath, JSON.stringify(routes, null, 2) + "\n");
const finalSlugs = new Map(routes.map((route) => [route.provider_model_slug.toLowerCase(), route]));
const excludedAll = payload.data.flatMap((model) => {
  const lower = model.id.toLowerCase();
  if (lower.endsWith(":free")) return [{ id: model.id, category: "service-tier alias", reason: "Free variant of a separately catalogued model." }];
  if (exclusions.has(lower)) return [{ id: model.id, category: lower === "fastrouter/auto" ? "router" : "alias or preset", reason: exclusions.get(lower) }];
  return [];
});
const catalogued = payload.data.flatMap((model) => {
  const route = finalSlugs.get(model.id.toLowerCase());
  return route ? [{ id: model.id, canonical_model_id: route.api_model_id, capability: route.capabilities[0].capability_id, active: route.routing_status === "active" }] : [];
});
const report = {
  source: sourceUrl, checked_at: checkedAt, live_total: payload.data.length,
  reconciliation: { catalogued_models: catalogued.length, excluded_noncanonical_entries: excludedAll.length, unaccounted: payload.data.length - catalogued.length - excludedAll.length },
  catalogued, excluded: excludedAll,
};
if (report.reconciliation.unaccounted !== 0) throw new Error(`FastRouter reconciliation has ${report.reconciliation.unaccounted} unaccounted entries`);
await writeFile(path.resolve("scripts/model-discovery/fastrouter-reconciliation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.reconciliation));
