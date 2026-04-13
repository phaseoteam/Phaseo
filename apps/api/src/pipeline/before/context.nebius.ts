import type { GatewayContextData } from "./types";

const NEBIUS_REGIONAL_MODEL_ALLOWLIST: Record<string, readonly string[]> = {
	"nebius-token-factory-eu-north-1": [
		"nvidia/nemotron-3-super-120b-a12b",
		"nvidia/nemotron-3-super-2026-03-11",
	],
	"nebius-token-factory-us-central-1": [
		"nvidia/nemotron-3-super-120b-a12b",
		"nvidia/nemotron-3-super-2026-03-11",
	],
};

const NEBIUS_REGIONAL_MODEL_ALLOWLIST_SETS = Object.fromEntries(
	Object.entries(NEBIUS_REGIONAL_MODEL_ALLOWLIST).map(([providerId, modelIds]) => [
		providerId,
		new Set(modelIds.map((modelId) => String(modelId).trim().toLowerCase()).filter(Boolean)),
	]),
) as Record<string, Set<string>>;

export function splitProviderScopedModel(model: string): { providerId: string; providerModelSlug: string } | null {
	const value = String(model ?? "").trim();
	const slash = value.indexOf("/");
	if (slash <= 0 || slash === value.length - 1) return null;
	const providerId = value.slice(0, slash).trim().toLowerCase();
	const providerModelSlug = value.slice(slash + 1).trim();
	if (!providerId || !providerModelSlug) return null;
	return { providerId, providerModelSlug };
}

function normalizeModelId(value: string | null | undefined): string {
	return String(value ?? "").trim().toLowerCase();
}

function providerAllowsNebiusRegionalModel(args: {
	providerId: string;
	providerModelSlug: string | null;
	resolvedModel: string | null | undefined;
	requestedModel: string;
}): boolean {
	const allowlist = NEBIUS_REGIONAL_MODEL_ALLOWLIST_SETS[args.providerId];
	if (!allowlist) return true;

	const directSlug = normalizeModelId(args.providerModelSlug);
	if (directSlug && allowlist.has(directSlug)) return true;

	const resolvedModel = normalizeModelId(args.resolvedModel);
	if (resolvedModel && allowlist.has(resolvedModel)) return true;

	const requestedModel = normalizeModelId(args.requestedModel);
	if (requestedModel && allowlist.has(requestedModel)) return true;

	const requestedScoped = splitProviderScopedModel(args.requestedModel);
	if (requestedScoped && requestedScoped.providerId === args.providerId) {
		const scopedSlug = normalizeModelId(requestedScoped.providerModelSlug);
		if (scopedSlug && allowlist.has(scopedSlug)) return true;
	}

	const resolvedScoped = splitProviderScopedModel(String(args.resolvedModel ?? ""));
	if (resolvedScoped && resolvedScoped.providerId === args.providerId) {
		const scopedSlug = normalizeModelId(resolvedScoped.providerModelSlug);
		if (scopedSlug && allowlist.has(scopedSlug)) return true;
	}

	return false;
}

export function applyNebiusRegionalModelAllowlist(args: {
	parsed: GatewayContextData;
	requestedModel: string;
}): GatewayContextData {
	const parsed = args.parsed;
	const providers = Array.isArray(parsed.providers) ? parsed.providers : [];
	if (!providers.length) return parsed;

	let changed = false;
	const filteredProviders = providers.filter((provider) => {
		const allowed = providerAllowsNebiusRegionalModel({
			providerId: provider.providerId,
			providerModelSlug: provider.providerModelSlug,
			resolvedModel: parsed.resolvedModel,
			requestedModel: args.requestedModel,
		});
		if (!allowed) changed = true;
		return allowed;
	});

	if (!changed) return parsed;

	const allowedProviderIds = new Set(filteredProviders.map((provider) => provider.providerId));
	const filteredPricing = Object.fromEntries(
		Object.entries(parsed.pricing ?? {}).filter(([providerId]) =>
			allowedProviderIds.has(providerId),
		),
	);

	return {
		...parsed,
		providers: filteredProviders,
		pricing: filteredPricing,
	};
}
