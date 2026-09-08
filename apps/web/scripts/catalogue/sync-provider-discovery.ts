import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { normalizeProviderModelPricing } from "../../../api/src/pipeline/model-discovery/pricing-normalizers";
import { getProviderSyncProvider, getProviderSyncProviderIds } from "./provider-sync/providers";
import { parseProviderModelList } from "./provider-sync/provider";
import type { OfficialPricingReport } from "./sync-official-pricing";
import {
	filesNamed,
	type JsonObject,
	mergeSimplePricing,
	normalized,
	pricingRule,
	readJson,
	safePricingRules,
	type PricingRuleOptions,
	writeJsonIfChanged as writeSharedJsonIfChanged,
} from "./catalogue-sync-shared";

export { mergeSimplePricing, safePricingRules } from "./catalogue-sync-shared";

type DiscoveryRow = {
	provider_id: string;
	model_id: string;
	model_details: JsonObject;
	last_seen_at: string;
	source_url?: string;
};

type SyncReport = {
	providers: number;
	rows: number;
	mappingsCreated: number;
	mappingsUpdated: number;
	pricingCreated: number;
	pricingUpdated: number;
	unmatched: string[];
	skippedPricing: string[];
	sourceErrors: string[];
	changedFiles: string[];
	officialPricing?: OfficialPricingReport;
	modelsDevPricing?: {
		pricingCreated: number;
		pricingSkippedExisting: number;
	};
};

const PROVIDER_ALIASES: Record<string, string> = {
	"aion-labs": "aion-labs",
	"amazon-bedrock": "amazon-bedrock",
	"arcee-ai": "arcee-ai",
	"atlascloud": "atlascloud",
	"gmicloud": "gmicloud",
	"moonshotai": "moonshotai",
	"moonshotai-turbo": "moonshotai-turbo",
	"novitaai": "novita",
};

const DATA_ROOT = path.resolve(process.cwd(), "../../packages/data/catalog/src/data");
const PROVIDERS_ROOT = path.join(DATA_ROOT, "api_providers");
const PRICING_ROOT = path.join(DATA_ROOT, "pricing");
const DRY_RUN = process.argv.includes("--dry-run");
const LIVE_MODE = process.argv.includes("--live");

const PRICING_CAPABILITIES = new Set([
	"text.generate",
	"text.embed",
	"embeddings",
	"image.generate",
	"video.generate",
	"audio.generate",
	"audio.transcribe",
	"text.rerank",
]);

function requestedProviders(): string[] | null {
	const values = process.argv.flatMap((value) => {
		if (!value.startsWith("--provider=") && !value.startsWith("--providers=")) return [];
		return value.split("=", 2)[1]?.split(",") ?? [];
	});
	const providers = [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
	return providers.length > 0 ? providers : null;
}

const PROVIDER_FILTERS = requestedProviders();

function fileSlug(value: string): string {
	return normalized(value).replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function asRecord(value: unknown): JsonObject | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function sourceForRow(row: DiscoveryRow): JsonObject | null {
	return row.source_url ? {
		kind: "provider_models",
		url: row.source_url,
		accessed_at: row.last_seen_at,
		notes: "Provider model and pricing metadata.",
	} : null;
}

export function simpleNonTokenPricing(
	providerId: string,
	modelDetails: JsonObject,
	capabilityId: string,
): { meters: Record<string, number>; ruleOptions: Record<string, PricingRuleOptions> } | null {
	if (providerId === "orcarouter") {
		// Video discovery prices are headline rates, not complete task prices.
		// H3 uses request_unit=second; Kling also varies by duration, mode and audio.
		// Preserve the reviewed, conditional catalog instead of importing a flat request fee.
		if (capabilityId === "video.generate") return null;
		const pricing = asRecord(modelDetails.pricing);
		const requestPrice = Number(pricing?.request);
		if (Number.isFinite(requestPrice) && requestPrice >= 0) return {
			meters: { requests: requestPrice },
			ruleOptions: { requests: { unit: "request", unitSize: 1, note: "OrcaRouter published price per request." } },
		};
	}
	if (providerId !== "vercel") return null;
	const pricing = asRecord(modelDetails.pricing);
	if (!pricing) return null;
	if (capabilityId === "image.generate" && modelDetails.type === "image") {
		const price = Number(pricing.image);
		return Number.isFinite(price) && price >= 0 ? {
			meters: { output_image: price },
			ruleOptions: { output_image: { unit: "image", unitSize: 1, note: "Vercel AI Gateway list price per generated image." } },
		} : null;
	}
	if (capabilityId === "audio.generate" || capabilityId === "audio.transcribe") {
		const characterPrice = Number(pricing.speech_input_character_cost);
		if (Number.isFinite(characterPrice) && characterPrice >= 0) return {
			meters: { input_characters: characterPrice },
			ruleOptions: { input_characters: { unit: "character", unitSize: 1, note: "Vercel AI Gateway list price per input character." } },
		};
		const secondsPrice = Number(pricing.transcription_duration_cost_per_second);
		if (Number.isFinite(secondsPrice) && secondsPrice >= 0) return {
			meters: { input_audio_seconds: secondsPrice },
			ruleOptions: { input_audio_seconds: { unit: "second", unitSize: 1, note: "Vercel AI Gateway list price per input audio second." } },
		};
	}
	return null;
}

function capabilityForDetails(details: JsonObject): string {
	const type = normalized(details.type);
	if (type === "embedding") return "text.embed";
	if (type === "reranking" || type === "rerank") return "text.rerank";
	if (type === "image") return "image.generate";
	if (type === "video") return "video.generate";
	if (type === "speech") return "audio.generate";
	if (type === "transcription") return "audio.transcribe";
	if (type === "realtime") return "audio.realtime";
	const architecture = asRecord(details.architecture);
	const outputModalities = [
		...(Array.isArray(details.output_modalities) ? details.output_modalities : []),
		...(Array.isArray(architecture?.output_modalities) ? architecture.output_modalities : []),
	].map(normalized);
	if (outputModalities.includes("video")) return "video.generate";
	if (outputModalities.includes("image")) return "image.generate";
	if (outputModalities.includes("audio")) return "audio.generate";
	return "text.generate";
}

function modalitiesForDetails(details: JsonObject): { input: string | null; output: string | null } {
	const architecture = asRecord(details.architecture);
	const capabilities = asRecord(details.capabilities);
	const explicitInput = [
		...(Array.isArray(details.input_modalities) ? details.input_modalities : []),
		...(Array.isArray(architecture?.input_modalities) ? architecture.input_modalities : []),
	].map(normalized).filter(Boolean);
	const explicitOutput = [
		...(Array.isArray(details.output_modalities) ? details.output_modalities : []),
		...(Array.isArray(architecture?.output_modalities) ? architecture.output_modalities : []),
	].map(normalized).filter(Boolean);
	const imageInput = asRecord(capabilities?.image_input)?.supported === true;
	const input = [...new Set(["text", ...(imageInput ? ["image"] : []), ...explicitInput])];
	const output = [...new Set(explicitOutput.length > 0 ? explicitOutput : ["text"])];
	return { input: input.join(",") || null, output: output.join(",") || null };
}

function positiveInteger(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function writeJsonIfChanged(filePath: string, value: unknown, report: SyncReport): Promise<boolean> {
	return writeSharedJsonIfChanged(filePath, value, report, { dataRoot: DATA_ROOT, dryRun: DRY_RUN });
}

function deepPositiveInteger(value: unknown, keys: string[], depth = 0): number | null {
	if (depth > 4) return null;
	const record = asRecord(value);
	if (!record) return null;
	for (const key of keys) {
		const found = positiveInteger(record[key]);
		if (found !== null) return found;
	}
	for (const nested of Object.values(record)) {
		const found = deepPositiveInteger(nested, keys, depth + 1);
		if (found !== null) return found;
	}
	return null;
}

export function extractDiscoveryLimits(details: unknown): { context: number | null; output: number | null } {
	return {
		context: deepPositiveInteger(details, ["context_length", "context_window", "max_context_length", "max_input_tokens"]),
		output: deepPositiveInteger(details, ["max_completion_tokens", "max_output_tokens", "output_token_limit"]),
	};
}

function primaryCapability(model: JsonObject): string {
	const capability = Array.isArray(model.capabilities)
		? model.capabilities.find((entry: JsonObject) => typeof entry?.capability_id === "string")?.capability_id
		: null;
	return capability || "text.generate";
}

function newProviderModel(providerId: string, canonicalModelId: string, row: DiscoveryRow): JsonObject {
	const limits = extractDiscoveryLimits(row.model_details);
	const modalities = modalitiesForDetails(row.model_details);
	const capabilityId = capabilityForDetails(row.model_details);
	const source = sourceForRow(row);
	return {
		api_model_id: canonicalModelId,
		provider_api_model_id: `${providerId}:${canonicalModelId}`,
		provider_model_slug: row.model_id,
		internal_model_id: canonicalModelId,
		is_active_gateway: false,
		quantization_scheme: null,
		input_modalities: modalities.input,
		output_modalities: modalities.output,
		context_length: limits.context,
		max_output_tokens: limits.output,
		effective_from: null,
		effective_to: null,
		capabilities: [{
			capability_id: capabilityId,
			status: "active",
			params: [],
			reasoning: null,
			tool_call: null,
			structured_output: null,
			temperature: null,
			attachment: null,
			input_modalities: null,
			output_modalities: null,
			modes: [],
		}],
		routing_status: "active",
		routable: false,
		regions: { execution: ["global"], data: ["global"] },
		service_tiers: [],
		api: { formats: [], endpoint: null, deployment: null },
		sources: source ? [source] : [],
		verification: {
			status: "partial",
			checked_at: row.last_seen_at,
			notes: "Discovered from the provider models API; routing remains disabled pending review.",
		},
		rate_limits: [],
	};
}

export function parseLiveDiscoveryRows(providerId: string, payload: unknown, accessedAt: string, sourceUrl: string): DiscoveryRow[] {
	return parseProviderModelList(payload).map(({ id, details }) => ({
		provider_id: providerId,
		model_id: id,
		model_details: details,
		last_seen_at: accessedAt,
		source_url: sourceUrl,
	}));
}

async function fetchLiveDiscoveryRows(): Promise<{ rows: DiscoveryRow[]; errors: string[] }> {
	const providerIds = PROVIDER_FILTERS ?? getProviderSyncProviderIds();
	const providers = providerIds
		.map((providerId) => getProviderSyncProvider(providerId))
		.filter((provider): provider is NonNullable<typeof provider> => provider !== undefined);
	const results = await Promise.all(providers.map(async (provider) => {
		try {
			const accessedAt = new Date().toISOString();
			const payload = await provider.fetchModels();
			return {
				rows: provider.parseModels(payload).map(({ id, details }) => ({
					provider_id: provider.id,
					model_id: id,
					model_details: details,
					last_seen_at: accessedAt,
					source_url: provider.sourceUrl,
				})),
				error: null,
			};
		} catch (error) {
			return {
				rows: [],
				error: `${provider.id}: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}));
	return {
		rows: results.flatMap((result) => result.rows),
		errors: results.flatMap((result) => result.error ? [result.error] : []),
	};
}

export function hasUsableDiscoveryDetails(details: unknown): boolean {
	const record = asRecord(details);
	return Boolean(record) && Object.keys(record as JsonObject).length > 0;
}

async function fetchDiscoveryRows(): Promise<DiscoveryRow[]> {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
	const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
	const output: DiscoveryRow[] = [];
	let from = 0;
	while (true) {
		let query = supabase
			.from("model_discovery_seen_models")
			.select("provider_id,model_id,model_details,last_seen_at")
			.order("provider_id", { ascending: true })
			.order("model_id", { ascending: true })
			.range(from, from + 999);
		if (PROVIDER_FILTERS?.length === 1) query = query.eq("provider_id", PROVIDER_FILTERS[0]);
		else if (PROVIDER_FILTERS && PROVIDER_FILTERS.length > 1) query = query.in("provider_id", PROVIDER_FILTERS);
		const { data, error } = await query;
		if (error) throw new Error(error.message || "Failed to load model discovery state");
		const rows = (data ?? []) as DiscoveryRow[];
		// Watcher state is ID-plus-snapshot only; enrichment data comes from live
		// provider fetches, so persisted rows without a usable payload object are skipped.
		output.push(...rows.filter((row) => hasUsableDiscoveryDetails(row.model_details)));
		if (rows.length < 1_000) break;
		from += 1_000;
	}
	return output;
}

async function loadCanonicalModelIndex(): Promise<{ ids: Set<string>; aliases: Map<string, string>; uniqueTails: Map<string, string>; uniqueCompactTails: Map<string, string> }> {
	const ids = new Set<string>();
	for (const filePath of await filesNamed(path.join(DATA_ROOT, "models"), "model.json")) {
		const model = await readJson<JsonObject>(filePath);
		if (model.model_id) ids.add(normalized(model.model_id));
	}
	const aliases = new Map<string, string>();
	for (const filePath of await filesNamed(path.join(DATA_ROOT, "aliases"), "alias.json")) {
		const alias = await readJson<JsonObject>(filePath);
		const target = normalized(alias.resolved_model_id ?? alias.resolved_api_model_id);
		if (alias.is_enabled !== false && ids.has(target)) aliases.set(normalized(alias.alias_slug), target);
	}
	const tails = new Map<string, string[]>();
	for (const id of ids) {
		const tail = id.split("/").slice(1).join("/");
		if (tail) tails.set(tail, [...(tails.get(tail) ?? []), id]);
	}
	const uniqueTails = new Map([...tails].filter(([, values]) => values.length === 1).map(([tail, values]) => [tail, values[0]!]));
	const compactTails = new Map<string, string[]>();
	for (const id of ids) {
		const tail = id.split("/").slice(1).join("/").replace(/[^a-z0-9]+/g, "");
		if (tail) compactTails.set(tail, [...(compactTails.get(tail) ?? []), id]);
	}
	const uniqueCompactTails = new Map([...compactTails].filter(([, values]) => values.length === 1).map(([tail, values]) => [tail, values[0]!]));
	return { ids, aliases, uniqueTails, uniqueCompactTails };
}

const PIONEER_CANONICAL_MODELS: Record<string, string> = {
	"qwen/qwen3-235b-a22b-instruct-2507": "qwen/qwen3-235b-a22b-instruct-2507",
	"claude-opus-5-fast": "anthropic/claude-opus-5-fast",
	"devstral-2": "mistral/devstral-2.0",
	"devstral-small-2": "mistral/devstral-small-2.0",
	"fastino/fastino-nemotron-3.5-lightning-finance": "fastino/nemotron-3.5-lightning-finance",
	"fastino/fastino-nemotron-3.5-lightning-healthcare": "fastino/nemotron-3.5-lightning-healthcare",
	"gemini-3-flash": "google/gemini-3-flash",
	"gemini-3.1-pro": "google/gemini-3.1-pro",
	"google/gemma-4-12b-it": "google/gemma-4-12b",
	"google/gemma-4-31b-it": "google/gemma-4-31b",
	"magistral-medium": "mistral/magistral-medium-1.2",
	"meta-llama/llama-3.1-8b-instruct": "meta/llama-3.1-8b",
	"meta-llama/llama-3.3-70b-instruct": "meta/llama-3.3-70b",
	"ministral-14b": "mistral/ministral-14b",
	"mistral-large-3": "mistral/mistral-large-3.0",
	"mistral-medium": "mistral/mistral-medium-3.0",
	"mistralai/codestral-22b-v0.1": "mistral/codestral-2024-05-29",
	"mistralai/ministral-8b-instruct-2410": "mistral/ministral-8b",
	"mistralai/mistral-nemo-instruct-2407": "mistral/mistral-nemo-2407",
	"mistralai/mistral-small-4-119b-2603": "mistral/mistral-small-4",
	"mistralai/pixtral-12b-2409": "mistral/pixtral-12b",
	"moonshotai/kimi-k3-fast": "moonshotai/kimi-k3-fast",
	"nvidia/nvidia-nemotron-3-nano-30b-a3b-bf16": "nvidia/nemotron-3-nano-30b-a3b",
	"nvidia/nvidia-nemotron-3-super-120b-a12b-fp8": "nvidia/nemotron-3-super-120b-a12b",
	"nvidia/nvidia-nemotron-3-ultra-550b-a55b-bf16": "nvidia/nemotron-3-ultra-550b-a55b",
	"nvidia/nvidia-nemotron-3.5-lightning-30b-a3b-bf16": "nvidia/nemotron-3.5-lightning",
	"zai-org/glm-5.2-fast": "z-ai/glm-5.2-fast",
};

function resolveCanonicalModelId(modelId: string, index: Awaited<ReturnType<typeof loadCanonicalModelIndex>>, providerId?: string): string | null {
	const id = normalized(modelId).replace(/^models\//, "");
	if (providerId === "pioneer" && PIONEER_CANONICAL_MODELS[id]) return PIONEER_CANONICAL_MODELS[id];
	if (index.ids.has(id)) return id;
	const alias = index.aliases.get(id);
	if (alias) return alias;
	const exactTail = index.uniqueTails.get(id);
	if (exactTail) return exactTail;
	const compactTail = id.split("/").at(-1)?.replace(/[^a-z0-9]+/g, "") ?? "";
	return index.uniqueCompactTails.get(compactTail) ?? null;
}

async function main(): Promise<void> {
	const liveOnlySelection = LIVE_MODE && PROVIDER_FILTERS?.length
		&& PROVIDER_FILTERS.every((providerId) => getProviderSyncProvider(providerId) !== undefined);
	const persistedRows = liveOnlySelection ? [] : await fetchDiscoveryRows();
	const live = LIVE_MODE ? await fetchLiveDiscoveryRows() : { rows: [], errors: [] };
	const rowsByKey = new Map<string, DiscoveryRow>();
	for (const row of persistedRows) rowsByKey.set(`${row.provider_id}:${row.model_id}`, row);
	for (const row of live.rows) rowsByKey.set(`${row.provider_id}:${row.model_id}`, row);
	const rows = [...rowsByKey.values()];
	const canonical = await loadCanonicalModelIndex();
	const report: SyncReport = {
		providers: new Set(rows.map((row) => row.provider_id)).size,
		rows: rows.length,
		mappingsCreated: 0,
		mappingsUpdated: 0,
		pricingCreated: 0,
		pricingUpdated: 0,
		unmatched: [],
		skippedPricing: [],
		sourceErrors: live.errors,
		changedFiles: [],
	};
	const pricingFiles = await filesNamed(PRICING_ROOT, "pricing.json");
	const pricingByKey = new Map<string, { path: string; value: JsonObject }>();
	for (const filePath of pricingFiles) {
		const value = await readJson<JsonObject>(filePath);
		pricingByKey.set(`${normalized(value.api_provider_id)}:${normalized(value.api_model_id)}:${normalized(value.capability_id)}`, { path: filePath, value });
	}

	const rowsByProvider = new Map<string, DiscoveryRow[]>();
	for (const row of rows) rowsByProvider.set(row.provider_id, [...(rowsByProvider.get(row.provider_id) ?? []), row]);
	for (const [discoveryProviderId, providerRows] of rowsByProvider) {
		const providerId = PROVIDER_ALIASES[discoveryProviderId] ?? discoveryProviderId;
		const providerDirectory = path.join(PROVIDERS_ROOT, providerId);
		const providerPath = path.join(providerDirectory, "api_provider.json");
		const modelsPath = path.join(providerDirectory, "models.json");
		const provider = await readJson<JsonObject>(providerPath).catch(() => null);
		if (!provider) {
			report.unmatched.push(`${discoveryProviderId}: provider is not present in the canonical catalog`);
			continue;
		}
		const models = await readJson<JsonObject[]>(modelsPath).catch((): JsonObject[] => []);
		let mappingsChanged = false;

		for (const row of providerRows) {
			let mapping = models.find((model) => normalized(model.provider_model_slug) === normalized(row.model_id));
			if (!mapping) {
				const canonicalModelId = resolveCanonicalModelId(row.model_id, canonical, discoveryProviderId);
				if (!canonicalModelId) {
					report.unmatched.push(`${discoveryProviderId}:${row.model_id}`);
					continue;
				}
				mapping = newProviderModel(providerId, canonicalModelId, row);
				models.push(mapping);
				report.mappingsCreated += 1;
				mappingsChanged = true;
			}

			const limits = extractDiscoveryLimits(row.model_details);
			const modalities = modalitiesForDetails(row.model_details);
			const source = sourceForRow(row);
			if (source && Array.isArray(mapping.sources) && !mapping.sources.some((entry: JsonObject) => entry?.url === source.url)) {
				mapping.sources.push(source);
				mappingsChanged = true;
				report.mappingsUpdated += 1;
			}
			if (mapping.context_length == null && limits.context !== null) {
				mapping.context_length = limits.context;
				mappingsChanged = true;
				report.mappingsUpdated += 1;
			}
			if (mapping.max_output_tokens == null && limits.output !== null) {
				mapping.max_output_tokens = limits.output;
				mappingsChanged = true;
				report.mappingsUpdated += 1;
			}
			if (mapping.input_modalities == null && modalities.input !== null) {
				mapping.input_modalities = modalities.input;
				mappingsChanged = true;
				report.mappingsUpdated += 1;
			}
			if (mapping.output_modalities == null && modalities.output !== null) {
				mapping.output_modalities = modalities.output;
				mappingsChanged = true;
				report.mappingsUpdated += 1;
			}

			const capabilityId = primaryCapability(mapping);
			let normalizedPricing = normalizeProviderModelPricing(discoveryProviderId, row.model_details);
			let ruleOptions: Record<string, PricingRuleOptions> = {};
			const simplePricing = simpleNonTokenPricing(discoveryProviderId, row.model_details, capabilityId);
			const normalizedHasOutput = normalizedPricing && Object.keys(normalizedPricing.meters).some((meter) =>
				(capabilityId === "image.generate"
					? ["output_image", "output_image_tokens", "output_text_tokens", "requests"]
					: capabilityId === "audio.generate"
						? ["output_audio_tokens", "output_text_tokens", "input_characters", "input_audio_seconds", "requests"]
						: ["output_text_tokens", "requests"]).includes(meter));
			if (simplePricing && (!normalizedPricing || !normalizedHasOutput)) {
				normalizedPricing = { currency: "USD", unit: "per_1m_tokens", meters: simplePricing.meters };
				ruleOptions = simplePricing.ruleOptions;
			}
			if (!normalizedPricing) continue;
			if (!PRICING_CAPABILITIES.has(capabilityId)) continue;
			const outputMeters = capabilityId === "image.generate"
				? ["output_image", "output_image_tokens", "output_text_tokens", "requests"]
				: capabilityId === "audio.generate"
					? ["output_audio_tokens", "output_text_tokens", "input_characters", "input_audio_seconds", "requests"]
					: ["output_text_tokens", "requests"];
			if ((capabilityId === "text.generate" || capabilityId === "image.generate" || capabilityId === "audio.generate")
				&& !outputMeters.some((meter) => normalizedPricing.meters[meter] !== undefined)) {
				report.skippedPricing.push(`${discoveryProviderId}:${row.model_id} has input-only pricing on a text generation mapping`);
				continue;
			}
			const apiModelId = String(mapping.api_model_id);
			const pricingKey = `${normalized(providerId)}:${normalized(apiModelId)}:${normalized(capabilityId)}`;
			const existing = pricingByKey.get(pricingKey);
			if (existing) {
				const merged = mergeSimplePricing(existing.value, normalizedPricing.meters, ruleOptions);
				if (merged.changed) {
					if (source && Array.isArray(existing.value.sources) && !existing.value.sources.some((entry: JsonObject) => entry?.url === source.url)) {
						existing.value.sources.push(source);
					}
					existing.value.verification = {
						status: "partial",
						checked_at: row.last_seen_at,
						notes: "Pricing synchronized from the provider models API.",
					};
					await writeJsonIfChanged(existing.path, merged.value, report);
					report.pricingUpdated += 1;
				} else if (!safePricingRules(existing.value)) {
					report.skippedPricing.push(`${discoveryProviderId}:${row.model_id} uses conditional or tiered pricing`);
				}
			} else {
				const pricing: JsonObject = {
					key: `${providerId}:${apiModelId}:${capabilityId}`,
					api_provider_id: providerId,
					provider_slug: providerId,
					api_model_id: apiModelId,
					capability_id: capabilityId,
					rules: Object.entries(normalizedPricing.meters).map(([meter, price]) => pricingRule(meter, price, "USD", ruleOptions[meter])),
					regions: [],
					service_tiers: ["standard"],
					sources: source ? [source] : [],
					verification: {
						status: "partial",
						checked_at: row.last_seen_at,
						notes: "Pricing synchronized from the provider models API.",
					},
				};
				const target = path.join(PRICING_ROOT, providerId, fileSlug(apiModelId), capabilityId, "pricing.json");
				await writeJsonIfChanged(target, pricing, report);
				pricingByKey.set(pricingKey, { path: target, value: pricing });
				report.pricingCreated += 1;
			}
		}

		if (mappingsChanged) {
			models.sort((left, right) => normalized(left.api_model_id).localeCompare(normalized(right.api_model_id)) || normalized(left.provider_model_slug).localeCompare(normalized(right.provider_model_slug)));
			await writeJsonIfChanged(modelsPath, models, report);
		}
	}

	report.unmatched = [...new Set(report.unmatched)].sort().slice(0, 500);
	report.skippedPricing = [...new Set(report.skippedPricing)].sort().slice(0, 500);
	report.changedFiles = [...new Set(report.changedFiles)].sort();
	await mkdir(path.join(process.cwd(), ".sync"), { recursive: true });
	const officialPricing = await readJson<SyncReport["officialPricing"]>(
		path.join(process.cwd(), ".sync", "official-pricing-sync.json"),
	).catch(() => undefined);
	report.officialPricing = officialPricing;
	report.modelsDevPricing = await readJson<SyncReport["modelsDevPricing"]>(
		path.join(process.cwd(), ".sync", "models-dev-pricing-sync.json"),
	).catch(() => undefined);
	const reportPath = path.join(process.cwd(), ".sync", "provider-catalog-sync.json");
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	const markdown = renderSyncMarkdown(report);
	await writeFile(path.join(process.cwd(), ".sync", "provider-catalog-sync.md"), markdown, "utf8");
	console.log(JSON.stringify(report));
}

export function renderSyncMarkdown(report: SyncReport): string {
	return [
		"## Provider catalog synchronization",
		"",
		`- Providers checked: ${report.providers}`,
		`- Discovery records checked: ${report.rows}`,
		`- Model mappings created: ${report.mappingsCreated}`,
		`- Model mappings enriched: ${report.mappingsUpdated}`,
		`- Pricing files created: ${report.pricingCreated}`,
		`- Pricing files updated: ${report.pricingUpdated}`,
		`- Unmatched upstream models: ${report.unmatched.length}`,
		`- Complex pricing records left unchanged: ${report.skippedPricing.length}`,
		`- Live source errors: ${report.sourceErrors.length}`,
		...(report.officialPricing ? [
			`- Official pricing providers checked: ${report.officialPricing.providers.length}`,
			`- Official pricing rows parsed: ${report.officialPricing.rowsParsed}`,
			`- Official pricing files created: ${report.officialPricing.pricingCreated}`,
			`- Official pricing files updated: ${report.officialPricing.pricingUpdated}`,
			`- Official pricing rows requiring review: ${report.officialPricing.unmatched.length + report.officialPricing.ambiguous.length + report.officialPricing.skippedComplex.length}`,
			`- Official pricing provider errors or parser gaps: ${report.officialPricing.providers.filter((provider) => provider.reason).length}`,
		] : []),
		...(report.modelsDevPricing ? [
			`- models.dev pricing files created: ${report.modelsDevPricing.pricingCreated}`,
			`- Existing pricing files preserved by models.dev fallback: ${report.modelsDevPricing.pricingSkippedExisting}`,
		] : []),
		...(report.officialPricing?.providers.some((provider) => provider.sourceUrl) ? [
			"<details><summary>Official pricing sources</summary>",
			"",
			...report.officialPricing.providers
				.filter((provider) => provider.sourceUrl)
				.map((provider) => `- \`${provider.provider}\`: ${provider.sourceUrl}`),
			"",
			"</details>",
			"",
		] : []),
		...(report.officialPricing?.providers.some((provider) => provider.reason) ? [
			"<details><summary>Official pricing provider notes</summary>",
			"",
			...report.officialPricing.providers
				.filter((provider) => provider.reason)
				.map((provider) => `- \`${provider.provider}\`: ${provider.reason}`),
			"",
			"</details>",
			"",
		] : []),
		"",
		"The workflow applies official provider pricing sources and the persisted Cloudflare provider discovery snapshot. New mappings remain non-routable, conditional/tiered pricing is never overwritten, and removals are not automated.",
		"",
		...(report.unmatched.length > 0 ? ["<details><summary>Unmatched upstream models</summary>", "", ...report.unmatched.slice(0, 100).map((value) => `- \`${value}\``), "", "</details>", ""] : []),
		...(report.skippedPricing.length > 0 ? ["<details><summary>Pricing requiring manual review</summary>", "", ...report.skippedPricing.slice(0, 100).map((value) => `- ${value}`), "", "</details>", ""] : []),
		...(report.sourceErrors.length > 0 ? ["<details><summary>Live source errors</summary>", "", ...report.sourceErrors.map((value) => `- ${value}`), "", "</details>", ""] : []),
		...(report.officialPricing?.providers.some((provider) => provider.comparisons.some((comparison) => comparison.status !== "equal")) ? [
			"<details><summary>Official pricing comparison</summary>",
			"",
			...report.officialPricing.providers.flatMap((provider) => provider.comparisons
				.filter((comparison) => comparison.status !== "equal")
				.slice(0, 150)
				.map((comparison) => {
					const currency = comparison.currency ?? "USD";
					const format = (price: number) => currency === "USD" ? `$${price}/M` : `${currency} ${price}/M`;
					return `- \`${provider.provider}\` \`${comparison.apiModelId}\` \`${comparison.capabilityId}\` \`${comparison.meter}\`: official **${format(comparison.officialPrice)}**, current **${comparison.currentPrices.length > 0 ? comparison.currentPrices.map(format).join(", ") : "missing"}** (${comparison.status})`;
				}),
			),
			"",
			"</details>",
			"",
		] : []),
		"Created with Codex",
	].join("\n");
}

const direct = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (direct) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
