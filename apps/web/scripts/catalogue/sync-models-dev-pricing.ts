import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
	filesNamed,
	type JsonObject,
	pricingRule,
	readJson,
	writeJsonIfChanged as writeSharedJsonIfChanged,
} from "./catalogue-sync-shared";

type SyncReport = {
	providers: number;
	modelMappings: number;
	pricingCandidates: number;
	pricingCreated: number;
	pricingSkippedExisting: number;
	pricingSkippedComplex: number;
	unmatchedProviders: string[];
	changedFiles: string[];
};

const DATA_ROOT = path.resolve(process.cwd(), "../../packages/data/catalog/src/data");
const PROVIDERS_ROOT = path.join(DATA_ROOT, "api_providers");
const PRICING_ROOT = path.join(DATA_ROOT, "pricing");
const SOURCE_URL = "https://models.dev/api.json";
const DRY_RUN = process.argv.includes("--dry-run");
const SUPPORTED_CAPABILITIES = new Set(["text.generate", "text.embed", "text.rerank", "embeddings"]);

function requestedProviders(): string[] | null {
	const values = process.argv.flatMap((value) => {
		if (!value.startsWith("--provider=") && !value.startsWith("--providers=")) return [];
		return value.split("=", 2)[1]?.split(",") ?? [];
	});
	const providers = [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
	return providers.length > 0 ? providers : null;
}

const PROVIDER_FILTERS = requestedProviders();

function asRecord(value: unknown): JsonObject | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function asNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string" || !value.trim()) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function slug(value: string): string {
	return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function modelDevMeters(cost: JsonObject): Record<string, number> | null {
	if (cost.tiers) return null;
	const meters = Object.fromEntries([
		["input_text_tokens", asNumber(cost.input)],
		["cached_read_text_tokens", asNumber(cost.cache_read)],
		["cached_write_text_tokens", asNumber(cost.cache_write)],
		["output_text_tokens", asNumber(cost.output)],
		["input_audio_tokens", asNumber(cost.input_audio)],
		["output_audio_tokens", asNumber(cost.output_audio)],
		["output_reasoning_tokens", asNumber(cost.reasoning)],
	].filter((entry): entry is [string, number] => entry[1] !== null));
	return Object.keys(meters).length > 0 ? meters : null;
}

async function writeJsonIfChanged(filePath: string, value: unknown, report: SyncReport): Promise<boolean> {
	return writeSharedJsonIfChanged(filePath, value, report, { dataRoot: DATA_ROOT, dryRun: DRY_RUN });
}

async function main(): Promise<void> {
	const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30_000) });
	if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`);
	const modelsDev = asRecord(await response.json());
	if (!modelsDev) throw new Error("models.dev returned an invalid catalogue");

	const pricingFiles = await filesNamed(PRICING_ROOT, "pricing.json");
	const pricingKeys = new Set<string>();
	for (const filePath of pricingFiles) {
		const pricing = await readJson<JsonObject>(filePath);
		pricingKeys.add(`${String(pricing.api_provider_id).toLowerCase()}:${String(pricing.api_model_id).toLowerCase()}:${String(pricing.capability_id).toLowerCase()}`);
	}

	const report: SyncReport = {
		providers: 0,
		modelMappings: 0,
		pricingCandidates: 0,
		pricingCreated: 0,
		pricingSkippedExisting: 0,
		pricingSkippedComplex: 0,
		unmatchedProviders: [],
		changedFiles: [],
	};
	const accessedAt = new Date().toISOString();
	for (const entry of await readdir(PROVIDERS_ROOT, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const providerId = entry.name;
		if (PROVIDER_FILTERS && !PROVIDER_FILTERS.includes(providerId)) continue;
		const providerDirectory = path.join(PROVIDERS_ROOT, providerId);
		const provider = await readJson<JsonObject>(path.join(providerDirectory, "api_provider.json")).catch(() => null);
		if (!provider?.gateway_kind) continue;
		report.providers += 1;
		const modelsDevProvider = asRecord(modelsDev[providerId]);
		const modelsDevModels = asRecord(modelsDevProvider?.models);
		if (!modelsDevModels) {
			report.unmatchedProviders.push(providerId);
			continue;
		}
		const models = await readJson<JsonObject[]>(path.join(providerDirectory, "models.json")).catch((): JsonObject[] => []);
		for (const mapping of models) {
			report.modelMappings += 1;
			const details = asRecord(modelsDevModels[String(mapping.provider_model_slug)]);
			const cost = asRecord(details?.cost);
			const meters = cost ? modelDevMeters(cost) : null;
			if (!meters) continue;
			for (const capability of Array.isArray(mapping.capabilities) ? mapping.capabilities : []) {
				const capabilityId = String(asRecord(capability)?.capability_id ?? "");
				if (!SUPPORTED_CAPABILITIES.has(capabilityId)) continue;
				report.pricingCandidates += 1;
				if (capabilityId === "text.generate" && meters.output_text_tokens === undefined) {
					report.pricingSkippedComplex += 1;
					continue;
				}
				const apiModelId = String(mapping.api_model_id);
				const key = `${providerId.toLowerCase()}:${apiModelId.toLowerCase()}:${capabilityId.toLowerCase()}`;
				if (pricingKeys.has(key)) {
					report.pricingSkippedExisting += 1;
					continue;
				}
				const pricing: JsonObject = {
					key: `${providerId}:${apiModelId}:${capabilityId}`,
					api_provider_id: providerId,
					provider_slug: providerId,
					api_model_id: apiModelId,
					capability_id: capabilityId,
					rules: Object.entries(meters).map(([meter, price]) => pricingRule(meter, price)),
					regions: [],
					service_tiers: ["standard"],
					sources: [{ kind: "models.dev", url: SOURCE_URL, accessed_at: accessedAt, notes: "Provider pricing catalogue fallback; direct provider feeds take precedence." }],
					verification: {
						status: "partial",
						checked_at: accessedAt,
						notes: "Pricing filled from the provider-specific models.dev catalogue because no direct local pricing record existed.",
					},
				};
				const target = path.join(PRICING_ROOT, providerId, slug(apiModelId), capabilityId, "pricing.json");
				await writeJsonIfChanged(target, pricing, report);
				pricingKeys.add(key);
				report.pricingCreated += 1;
			}
		}
	}

	report.unmatchedProviders.sort();
	report.changedFiles = [...new Set(report.changedFiles)].sort();
	await mkdir(path.join(process.cwd(), ".sync"), { recursive: true });
	await writeFile(path.join(process.cwd(), ".sync", "models-dev-pricing-sync.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
	await writeFile(path.join(process.cwd(), ".sync", "models-dev-pricing-sync.md"), [
		"## models.dev pricing fill",
		"",
		`- Gateway/catalogue providers checked: ${report.providers}`,
		`- Model mappings checked: ${report.modelMappings}`,
		`- Pricing candidates found: ${report.pricingCandidates}`,
		`- Missing pricing files created: ${report.pricingCreated}`,
		`- Existing pricing files preserved: ${report.pricingSkippedExisting}`,
		`- Conditional or incomplete prices skipped: ${report.pricingSkippedComplex}`,
		`- Providers without a models.dev entry: ${report.unmatchedProviders.length}`,
		"",
		"This is a lower-priority fill source. Direct provider feeds and official pricing pages are not overwritten.",
		"",
		"Created with Codex",
	].join("\n") + "\n", "utf8");
	console.log(JSON.stringify(report));
}

const direct = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (direct) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
