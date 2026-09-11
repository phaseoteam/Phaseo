import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const endpoint = "https://api.kilo.ai/api/gateway/models";
const root = new URL("../packages/data/catalog/src/data/pricing/kilo/", import.meta.url);
const routesUrl = new URL("../packages/data/catalog/src/data/api_providers/kilo/models.json", import.meta.url);
const modelsRoot = new URL("../packages/data/catalog/src/data/models/", import.meta.url);
const organisationsRoot = new URL("../packages/data/catalog/src/data/organisations/", import.meta.url);
const response = await fetch(endpoint);
if (!response.ok) throw new Error(`Kilo models request failed: ${response.status}`);
const { data: models } = await response.json();

const slug = (id) => id.replace(/^~/, "alias-").replaceAll("/", "-").replaceAll(":", "-");
const rule = (meter, unit, unitSize, pricePerUnit, note = null) => ({
  meter,
  unit,
  unit_size: unitSize,
  price_per_unit: pricePerUnit,
  currency: "USD",
  pricing_plan: "standard",
  note,
  match: [],
  priority: 100,
  region: null,
  cache_duration_seconds: null,
  conditions: [],
  source: {
    kind: "official_models",
    url: endpoint,
    accessed_at: "2026-08-24T00:00:00Z",
    notes: "Kilo Gateway live public model catalogue.",
  },
});

for (const model of models) {
  const prices = model.pricing ?? {};
  if (Number(prices.prompt) < 0 || Number(prices.completion) < 0) continue;
  const rules = [];
  const tokenMeters = [
    ["input_cache_read", "cached_read_text_tokens"],
    ["input_cache_write", "cached_write_text_tokens"],
    ["prompt", "input_text_tokens"],
    ["completion", "output_text_tokens"],
    ["image", "input_image_tokens"],
    ["internal_reasoning", "output_reasoning_tokens"],
  ];
  for (const [field, meter] of tokenMeters) {
    if (prices[field] != null && Number(prices[field]) !== 0) {
      rules.push(rule(meter, "token", 1_000_000, Number(prices[field]) * 1_000_000));
    }
  }
  if (prices.request != null && Number(prices.request) !== 0) {
    rules.push(rule("requests", "request", 1, Number(prices.request)));
  }
  if (prices.web_search != null && Number(prices.web_search) !== 0) {
    rules.push(rule("native_web_search_requests", "request", 1, Number(prices.web_search)));
  }
  if (rules.length === 0 && Number(prices.prompt) === 0 && Number(prices.completion) === 0) {
    rules.push(rule("input_text_tokens", "token", 1_000_000, 0, "Free Kilo Gateway route."));
    rules.push(rule("output_text_tokens", "token", 1_000_000, 0, "Free Kilo Gateway route."));
  }

  const outputs = model.architecture?.output_modalities ?? ["text"];
  const capability = outputs.includes("audio")
    ? "audio.generate"
    : outputs.includes("image")
      ? "image.generate"
      : "text.generate";
  const path = join(root.pathname.slice(1), slug(model.id), capability, "pricing.json");
  await mkdir(dirname(path), { recursive: true });
  const payload = {
    key: `kilo:${model.id}:${capability}`,
    api_provider_id: "kilo",
    provider_slug: "kilo",
    api_model_id: model.id,
    capability_id: capability,
    rules,
    regions: [],
    service_tiers: ["standard"],
    sources: [{
      kind: "official_models",
      url: endpoint,
      accessed_at: "2026-08-24T00:00:00Z",
      notes: "Live model availability, exact ID, modalities, limits, supported parameters, and pricing.",
    }],
    verification: {
      status: "verified",
      checked_at: "2026-08-24T00:00:00Z",
      notes: "Synchronized from Kilo Gateway's unauthenticated live models endpoint.",
    },
  };
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
}

const existingRoutes = JSON.parse(await readFile(routesUrl, "utf8"));
const liveIds = new Set(models.map((model) => model.id));
const historicalRoutes = existingRoutes
  .filter((route) => !liveIds.has(route.api_model_id))
  .map((route) => ({
    ...route,
    effective_to: route.effective_to ?? "2026-08-24T00:00:00Z",
    capabilities: route.capabilities.map((capability) => ({ ...capability, status: "disabled" })),
    routing_status: "disabled",
  }));

const aliases = {
  "x-ai": "spacex-ai",
  "meta-llama": "meta",
  "ibm-granite": "ibm",
  mistralai: "mistral",
};
const internalId = (id) => {
  const clean = id.replace(/^~/, "").replace(/:(free|thinking)$/, "");
  const [provider, ...rest] = clean.split("/");
  if (provider === "kilo-auto") return `kilo/${rest.join("/")}`;
  return `${aliases[provider] ?? provider}/${rest.join("/")}`;
};
const canonicalModelId = (id) => id.endsWith(":free") ? `${internalId(id)}:free` : internalId(id);
const liveRoutes = models.map((model) => {
  const inputs = model.architecture?.input_modalities ?? ["text"];
  const outputs = model.architecture?.output_modalities ?? ["text"];
  const params = model.supported_parameters ?? [];
  const capability = outputs.includes("audio")
    ? "audio.generate"
    : outputs.includes("image")
      ? "image.generate"
      : "text.generate";
  return {
    api_model_id: model.id,
    provider_api_model_id: `kilo:${model.id}`,
    provider_model_slug: model.id,
    internal_model_id: internalId(model.id),
    canonical_model_id: canonicalModelId(model.id),
    is_active_gateway: false,
    quantization_scheme: null,
    input_modalities: inputs.join(","),
    output_modalities: outputs.join(","),
    context_length: model.context_length ?? model.top_provider?.context_length ?? null,
    max_output_tokens: model.top_provider?.max_completion_tokens ?? null,
    effective_from: model.created > 0 ? new Date(model.created * 1000).toISOString() : null,
    effective_to: null,
    capabilities: [{
      capability_id: capability,
      status: "active",
      params,
      reasoning: params.includes("reasoning") || params.includes("include_reasoning"),
      tool_call: params.includes("tools"),
      structured_output: params.includes("response_format") || params.includes("structured_outputs"),
      temperature: params.includes("temperature"),
      attachment: inputs.some((input) => input !== "text"),
      input_modalities: inputs,
      output_modalities: outputs,
      modes: [],
    }],
    routing_status: "active",
    routable: false,
    regions: { execution: ["global"], data: ["global"] },
    service_tiers: ["standard"],
    api: {
      formats: ["openai.chat.completions"],
      endpoint: "https://api.kilo.ai/api/gateway/chat/completions",
      deployment: null,
    },
    sources: [{
      kind: "official_models",
      url: endpoint,
      accessed_at: "2026-08-24T00:00:00Z",
      notes: "Live exact ID, availability, modalities, limits, and supported parameters.",
    }],
    verification: {
      status: "verified",
      checked_at: "2026-08-24T00:00:00Z",
      notes: "Verified against Kilo Gateway's unauthenticated live models endpoint; Phaseo routing remains disabled.",
    },
    rate_limits: [],
  };
});
await writeFile(routesUrl, `${JSON.stringify([...liveRoutes, ...historicalRoutes], null, 2)}\n`);

const modelFiles = await readdir(modelsRoot, { recursive: true, withFileTypes: true });
const canonicalIds = new Set();
for (const file of modelFiles) {
  if (!file.isFile() || file.name !== "model.json") continue;
  canonicalIds.add(JSON.parse(await readFile(join(file.parentPath, file.name), "utf8")).model_id);
}
const organisationDirs = new Set(
  (await readdir(organisationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
);
for (const model of models) {
  const canonicalId = internalId(model.id);
  if (canonicalIds.has(canonicalId)) continue;
  const [organisationId, ...modelParts] = canonicalId.split("/");
  if (!organisationDirs.has(organisationId)) {
    const organisationPath = join(organisationsRoot.pathname.slice(1), organisationId, "organisation.json");
    await mkdir(dirname(organisationPath), { recursive: true });
    await writeFile(organisationPath, `${JSON.stringify({
      organisation_id: organisationId,
      name: organisationId.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "),
      country_code: null,
      description: `Model publisher represented in the Kilo Gateway catalogue under the ${organisationId} namespace.`,
      colour: null,
      organisation_links: [],
      status: "active",
      routable: null,
      sources: [{ kind: "official_models", url: endpoint, accessed_at: "2026-08-24T00:00:00Z", notes: `Kilo Gateway publisher namespace: ${organisationId}.` }],
      verification: { status: "partial", checked_at: "2026-08-24T00:00:00Z", notes: "Publisher namespace verified from Kilo's live catalogue; legal identity and location were not independently verified." },
    }, null, 2)}\n`);
    organisationDirs.add(organisationId);
  }
  const inputs = model.architecture?.input_modalities ?? ["text"];
  const outputs = model.architecture?.output_modalities ?? ["text"];
  const modelPath = join(modelsRoot.pathname.slice(1), organisationId, modelParts.join("-"), "model.json");
  await mkdir(dirname(modelPath), { recursive: true });
  await writeFile(modelPath, `${JSON.stringify({
    model_id: canonicalId,
    organisation_id: organisationId,
    name: model.name,
    status: "Available",
    previous_model_id: null,
    description: model.description ?? null,
    announced_date: null,
    release_date: null,
    deprecation_date: null,
    retirement_date: model.expiration_date && model.expiration_date !== "2098-12-31" ? `${model.expiration_date}T00:00:00` : null,
    license: null,
    input_types: inputs,
    output_types: outputs,
    api_model_id: canonicalId,
    family_id: null,
    links: [{ title: "Kilo Gateway models", kind: "api_reference", url: endpoint }],
    details: model.created > 0 ? [{ name: "kilo_catalog_created", value: new Date(model.created * 1000).toISOString() }] : [],
    benchmarks: [],
    page_notice: null,
    model_type: outputs.includes("audio") ? "audio" : outputs.includes("image") ? "image" : "inference",
    knowledge_cutoff: null,
    limits: { context: model.context_length ?? null, input: model.context_length ?? null, output: model.top_provider?.max_completion_tokens ?? null },
    modalities: { input: inputs, output: outputs },
    reasoning: { supported: (model.supported_parameters ?? []).some((param) => param.includes("reasoning")), options: [] },
    capabilities: {
      attachment: inputs.some((input) => input !== "text"),
      tool_call: (model.supported_parameters ?? []).includes("tools"),
      structured_output: (model.supported_parameters ?? []).some((param) => param.includes("structured") || param === "response_format"),
      temperature: (model.supported_parameters ?? []).includes("temperature"),
      streaming: true,
      web_search: Number(model.pricing?.web_search ?? 0) > 0,
    },
    open_weights: null,
    sources: [{ kind: "official_models", url: endpoint, accessed_at: "2026-08-24T00:00:00Z", notes: "Exact Kilo Gateway model identity, description, availability, modalities, limits, and supported parameters." }],
    verification: { status: "partial", checked_at: "2026-08-24T00:00:00Z", notes: "Kilo Gateway availability and technical metadata verified; upstream release lifecycle was not published by Kilo." },
    last_updated: "2026-08-24T00:00:00Z",
    removal_date: null,
    replacement_model_id: null,
    license_url: null,
  }, null, 2)}\n`);
  canonicalIds.add(canonicalId);
}

const refreshedModelFiles = await readdir(modelsRoot, { recursive: true, withFileTypes: true });
const modelPaths = new Map();
for (const file of refreshedModelFiles) {
  if (!file.isFile() || file.name !== "model.json") continue;
  const path = join(file.parentPath, file.name);
  modelPaths.set(JSON.parse(await readFile(path, "utf8")).model_id, path);
}
for (const model of models.filter((entry) => entry.id.endsWith(":free"))) {
  const baseId = internalId(model.id);
  const path = modelPaths.get(baseId);
  if (!path) throw new Error(`Missing base model for free Kilo route: ${model.id}`);
  const payload = JSON.parse(await readFile(path, "utf8"));
  payload.variants ??= [];
  if (!payload.variants.some((variant) => variant.model_id === `${baseId}:free`)) {
    payload.variants.push({ model_id: `${baseId}:free`, name: `${payload.name} (Free)`, variant_kind: "free" });
    await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
  }
}

console.log(`Synchronized ${models.length} live and preserved ${historicalRoutes.length} historical Kilo routes.`);
