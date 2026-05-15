import type { ProviderRestrictionMode } from "@/app/(dashboard)/settings/guardrails/actions";

export type GuardrailPreviewProvider = {
	id: string;
	name: string;
};

export type GuardrailPreviewProviderModel = {
	providerId: string;
	apiModelId: string;
	internalModelId: string | null;
};

export type GuardrailRestrictionPreview = {
	allowedProviderIds: string[];
	blockedProviderIds: string[];
	reachableProviderIds: string[];
	reachableModelIds: string[];
	blockedModelIds: string[];
	activeRouteCount: number;
	filteredRouteCount: number;
};

function uniqStrings(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

function normalizeProviderIds(
	providers: GuardrailPreviewProvider[],
	selectedProviderIds: string[],
): string[] {
	const knownProviderIds = providers.map((provider) => provider.id);
	return uniqStrings([...knownProviderIds, ...selectedProviderIds]).sort((a, b) =>
		a.localeCompare(b),
	);
}

export function describeProviderRestrictionMode(mode: ProviderRestrictionMode): string {
	switch (mode) {
		case "allowlist":
			return "Only allow";
		case "blocklist":
			return "Allow all except";
		default:
			return "Allow all";
	}
}

export function describeModelRestrictionMode(mode: ProviderRestrictionMode): string {
	switch (mode) {
		case "allowlist":
			return "Only allow";
		case "blocklist":
			return "Allow all except";
		default:
			return "Allow all";
	}
}

export function buildGuardrailRestrictionPreview(args: {
	providers: GuardrailPreviewProvider[];
	activeProviderModels: GuardrailPreviewProviderModel[];
	providerRestrictionMode: ProviderRestrictionMode;
	providerRestrictionProviderIds: string[];
	modelRestrictionMode: ProviderRestrictionMode;
	allowedApiModelIds: string[];
}): GuardrailRestrictionPreview {
	const selectedProviderIds = uniqStrings(args.providerRestrictionProviderIds).sort((a, b) =>
		a.localeCompare(b),
	);
	const selectedModelIds = uniqStrings(args.allowedApiModelIds).sort((a, b) =>
		a.localeCompare(b),
	);
	const allProviderIds = normalizeProviderIds(args.providers, selectedProviderIds);

	const allowedProviderIds =
		args.providerRestrictionMode === "allowlist"
			? selectedProviderIds
			: allProviderIds.filter((providerId) => !selectedProviderIds.includes(providerId));

	const blockedProviderIds =
		args.providerRestrictionMode === "blocklist"
			? selectedProviderIds
			: allProviderIds.filter((providerId) => !allowedProviderIds.includes(providerId));

	const providerFilteredRoutes = args.activeProviderModels.filter((route) =>
		allowedProviderIds.includes(route.providerId),
	);

	const providerVisibleModelIds = uniqStrings(
		providerFilteredRoutes.map((route) => route.apiModelId),
	).sort((a, b) => a.localeCompare(b));

	const allowedModelIds =
		args.modelRestrictionMode === "allowlist"
			? selectedModelIds
			: providerVisibleModelIds.filter((modelId) => !selectedModelIds.includes(modelId));

	const blockedModelIds =
		args.modelRestrictionMode === "blocklist"
			? selectedModelIds
			: providerVisibleModelIds.filter((modelId) => !allowedModelIds.includes(modelId));

	const finalRoutes =
		args.modelRestrictionMode === "none"
			? providerFilteredRoutes
			: providerFilteredRoutes.filter((route) => allowedModelIds.includes(route.apiModelId));

	return {
		allowedProviderIds,
		blockedProviderIds,
		reachableProviderIds: uniqStrings(finalRoutes.map((route) => route.providerId)).sort((a, b) =>
			a.localeCompare(b),
		),
		reachableModelIds: uniqStrings(finalRoutes.map((route) => route.apiModelId)).sort((a, b) =>
			a.localeCompare(b),
		),
		blockedModelIds:
			args.modelRestrictionMode === "none"
				? []
				: blockedModelIds,
		activeRouteCount: args.activeProviderModels.length,
		filteredRouteCount: finalRoutes.length,
	};
}
