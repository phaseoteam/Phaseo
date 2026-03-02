import fs from "node:fs";
import path from "node:path";

function resolveDataRoot(): string {
	const candidates = [
		path.join(process.cwd(), "src", "data"),
		path.join(process.cwd(), "apps", "web", "src", "data"),
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate;
	}
	return candidates[0];
}

const DATA_ROOT = resolveDataRoot();
const API_PROVIDERS_ROOT = path.join(DATA_ROOT, "api_providers");
const PRICING_ROOT = path.join(DATA_ROOT, "pricing");

const MODEL_ALIAS_STOPWORDS = new Set([
	"instruct",
	"instruction",
	"thinking",
	"reasoning",
	"chat",
	"free",
	"preview",
	"latest",
]);

type RawCapabilityParam = {
	param_id?: unknown;
};

type RawCapability = {
	capability_id?: unknown;
	status?: unknown;
	params?: unknown;
};

type RawProviderModel = {
	api_model_id?: unknown;
	provider_api_model_id?: unknown;
	internal_model_id?: unknown;
	is_active_gateway?: unknown;
	capabilities?: unknown;
};

export type ApiModelConflictEntry = {
	providerId: string;
	apiModelId: string;
	providerApiModelId: string;
	internalModelId: string | null;
	isActiveGateway: boolean;
	activeCapabilities: string[];
	supportedParams: string[];
	missingPricingCapabilities: string[];
	modelSlug: string;
	canonicalKey: string;
	hasPotentialAliasConflict: boolean;
	conflictApiModelIds: string[];
	likelyMismatchPricingSlugs: string[];
};

export type ApiModelConflictGroup = {
	canonicalKey: string;
	apiModelIds: string[];
	providers: string[];
	entryCount: number;
	missingPricingCount: number;
	likelyMismatchCount: number;
};

export type ProviderOrphanPricing = {
	providerId: string;
	orphanModelSlugs: string[];
};

export type ApiModelConflictsSnapshot = {
	generatedAt: string;
	totals: {
		providers: number;
		providerModels: number;
		modelsWithMissingPricing: number;
		modelsWithPotentialAliasConflict: number;
		conflictGroups: number;
		orphanPricingDirectories: number;
		likelyMismatchRows: number;
	};
	entries: ApiModelConflictEntry[];
	conflictGroups: ApiModelConflictGroup[];
	orphanPricingByProvider: ProviderOrphanPricing[];
};

function listDirectories(root: string): string[] {
	if (!fs.existsSync(root)) return [];
	return fs
		.readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

function parseJsonArray<T>(filePath: string): T[] {
	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed) ? (parsed as T[]) : [];
	} catch {
		return [];
	}
}

function parseString(value: unknown): string {
	if (typeof value !== "string") return "";
	return value.trim();
}

function toSlug(apiModelId: string): string {
	return apiModelId.replace(/[/:]/g, "-");
}

function tokenizeModelId(value: string): string[] {
	return value
		.toLowerCase()
		.replace(/[/:._]/g, "-")
		.replace(/[^a-z0-9-]+/g, "-")
		.split("-")
		.map((token) => token.trim())
		.filter(Boolean);
}

function toCanonicalKey(value: string): string {
	const tokens = tokenizeModelId(value);
	const filtered = tokens.filter((token) => !MODEL_ALIAS_STOPWORDS.has(token));
	if (filtered.length > 0) return filtered.join("-");
	return tokens.join("-");
}

function asCapabilities(value: unknown): RawCapability[] {
	return Array.isArray(value) ? (value as RawCapability[]) : [];
}

function asCapabilityParams(value: unknown): RawCapabilityParam[] {
	return Array.isArray(value) ? (value as RawCapabilityParam[]) : [];
}

function extractActiveCapabilities(capabilities: RawCapability[]): string[] {
	const ids = new Set<string>();
	for (const capability of capabilities) {
		const id = parseString(capability.capability_id);
		if (!id) continue;
		const status = parseString(capability.status).toLowerCase();
		if (status === "disabled") continue;
		ids.add(id);
	}
	return Array.from(ids).sort((a, b) => a.localeCompare(b));
}

function extractSupportedParams(capabilities: RawCapability[]): string[] {
	const params = new Set<string>();
	for (const capability of capabilities) {
		const status = parseString(capability.status).toLowerCase();
		if (status === "disabled") continue;
		for (const param of asCapabilityParams(capability.params)) {
			const paramId = parseString(param.param_id);
			if (!paramId) continue;
			params.add(paramId);
		}
	}
	return Array.from(params).sort((a, b) => a.localeCompare(b));
}

function getPricingModelSlugsByProvider(): Map<string, Set<string>> {
	const result = new Map<string, Set<string>>();
	for (const providerId of listDirectories(PRICING_ROOT)) {
		const providerRoot = path.join(PRICING_ROOT, providerId);
		result.set(providerId, new Set(listDirectories(providerRoot)));
	}
	return result;
}

function hasPricingFile(
	providerId: string,
	modelSlug: string,
	capabilityId: string,
): boolean {
	const pricingPath = path.join(
		PRICING_ROOT,
		providerId,
		modelSlug,
		capabilityId,
		"pricing.json",
	);
	return fs.existsSync(pricingPath);
}

export function buildApiModelConflictsSnapshot(): ApiModelConflictsSnapshot {
	const pricingSlugsByProvider = getPricingModelSlugsByProvider();
	const referencedModelSlugsByProvider = new Map<string, Set<string>>();
	const entries: ApiModelConflictEntry[] = [];

	for (const providerId of listDirectories(API_PROVIDERS_ROOT)) {
		const modelsPath = path.join(API_PROVIDERS_ROOT, providerId, "models.json");
		const rawModels = parseJsonArray<RawProviderModel>(modelsPath);
		if (rawModels.length === 0) continue;

		const referencedSlugs = new Set<string>();
		for (const rawModel of rawModels) {
			const apiModelId = parseString(rawModel.api_model_id);
			if (!apiModelId) continue;

			const providerApiModelId =
				parseString(rawModel.provider_api_model_id) ||
				`${providerId}:${apiModelId}`;
			const internalModelId = parseString(rawModel.internal_model_id) || null;
			const isActiveGateway = Boolean(rawModel.is_active_gateway);
			const modelSlug = toSlug(apiModelId);
			referencedSlugs.add(modelSlug);

			const capabilities = asCapabilities(rawModel.capabilities);
			const activeCapabilities = extractActiveCapabilities(capabilities);
			const supportedParams = extractSupportedParams(capabilities);
			const missingPricingCapabilities = activeCapabilities.filter(
				(capabilityId) => !hasPricingFile(providerId, modelSlug, capabilityId),
			);

			entries.push({
				providerId,
				apiModelId,
				providerApiModelId,
				internalModelId,
				isActiveGateway,
				activeCapabilities,
				supportedParams,
				missingPricingCapabilities,
				modelSlug,
				canonicalKey: toCanonicalKey(apiModelId),
				hasPotentialAliasConflict: false,
				conflictApiModelIds: [],
				likelyMismatchPricingSlugs: [],
			});
		}

		referencedModelSlugsByProvider.set(providerId, referencedSlugs);
	}

	const orphanPricingByProvider: ProviderOrphanPricing[] = [];
	const orphanCanonicalByProvider = new Map<string, Map<string, string[]>>();

	for (const [providerId, pricingSlugs] of pricingSlugsByProvider.entries()) {
		const referenced = referencedModelSlugsByProvider.get(providerId) ?? new Set<string>();
		const orphans = Array.from(pricingSlugs)
			.filter((slug) => !referenced.has(slug))
			.sort((a, b) => a.localeCompare(b));
		if (orphans.length === 0) continue;

		orphanPricingByProvider.push({
			providerId,
			orphanModelSlugs: orphans,
		});

		const byCanonical = new Map<string, string[]>();
		for (const slug of orphans) {
			const canonical = toCanonicalKey(slug);
			const list = byCanonical.get(canonical) ?? [];
			list.push(slug);
			byCanonical.set(canonical, list);
		}
		orphanCanonicalByProvider.set(providerId, byCanonical);
	}

	const groups = new Map<
		string,
		{
			apiModelIds: Set<string>;
			providers: Set<string>;
			entries: ApiModelConflictEntry[];
		}
	>();

	for (const entry of entries) {
		const group = groups.get(entry.canonicalKey) ?? {
			apiModelIds: new Set<string>(),
			providers: new Set<string>(),
			entries: [],
		};
		group.apiModelIds.add(entry.apiModelId);
		group.providers.add(entry.providerId);
		group.entries.push(entry);
		groups.set(entry.canonicalKey, group);
	}

	for (const entry of entries) {
		const group = groups.get(entry.canonicalKey);
		if (!group) continue;

		const conflictApiModelIds = Array.from(group.apiModelIds).sort((a, b) =>
			a.localeCompare(b),
		);
		entry.conflictApiModelIds = conflictApiModelIds;
		entry.hasPotentialAliasConflict = conflictApiModelIds.length > 1;

		if (entry.missingPricingCapabilities.length > 0) {
			const candidates =
				orphanCanonicalByProvider
					.get(entry.providerId)
					?.get(entry.canonicalKey)
					?.slice()
					.sort((a, b) => a.localeCompare(b)) ?? [];
			entry.likelyMismatchPricingSlugs = candidates;
		}
	}

	const conflictGroups: ApiModelConflictGroup[] = Array.from(groups.entries())
		.filter(([, group]) => group.apiModelIds.size > 1)
		.map(([canonicalKey, group]) => ({
			canonicalKey,
			apiModelIds: Array.from(group.apiModelIds).sort((a, b) =>
				a.localeCompare(b),
			),
			providers: Array.from(group.providers).sort((a, b) => a.localeCompare(b)),
			entryCount: group.entries.length,
			missingPricingCount: group.entries.filter(
				(entry) => entry.missingPricingCapabilities.length > 0,
			).length,
			likelyMismatchCount: group.entries.filter(
				(entry) => entry.likelyMismatchPricingSlugs.length > 0,
			).length,
		}))
		.sort((a, b) => {
			if (b.entryCount !== a.entryCount) return b.entryCount - a.entryCount;
			if (b.apiModelIds.length !== a.apiModelIds.length) {
				return b.apiModelIds.length - a.apiModelIds.length;
			}
			return a.canonicalKey.localeCompare(b.canonicalKey);
		});

	entries.sort((a, b) => {
		if (a.providerId !== b.providerId) {
			return a.providerId.localeCompare(b.providerId);
		}
		return a.apiModelId.localeCompare(b.apiModelId);
	});

	const orphanPricingDirectories = orphanPricingByProvider.reduce(
		(total, provider) => total + provider.orphanModelSlugs.length,
		0,
	);
	const modelsWithMissingPricing = entries.filter(
		(entry) => entry.missingPricingCapabilities.length > 0,
	).length;
	const modelsWithPotentialAliasConflict = entries.filter(
		(entry) => entry.hasPotentialAliasConflict,
	).length;
	const likelyMismatchRows = entries.filter(
		(entry) => entry.likelyMismatchPricingSlugs.length > 0,
	).length;

	return {
		generatedAt: new Date().toISOString(),
		totals: {
			providers: new Set(entries.map((entry) => entry.providerId)).size,
			providerModels: entries.length,
			modelsWithMissingPricing,
			modelsWithPotentialAliasConflict,
			conflictGroups: conflictGroups.length,
			orphanPricingDirectories,
			likelyMismatchRows,
		},
		entries,
		conflictGroups,
		orphanPricingByProvider: orphanPricingByProvider.sort((a, b) =>
			a.providerId.localeCompare(b.providerId),
		),
	};
}
