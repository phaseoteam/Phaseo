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
	accountProviderRestrictionMode?: ProviderRestrictionMode;
	accountProviderRestrictionProviderIds?: string[];
	accountModelRestrictionMode?: ProviderRestrictionMode;
	accountModelRestrictionModelIds?: string[];
}): GuardrailRestrictionPreview {
	const selectedProviderIds = uniqStrings(args.providerRestrictionProviderIds).sort((a, b) =>
		a.localeCompare(b),
	);
	const selectedModelIds = uniqStrings(args.allowedApiModelIds).sort((a, b) =>
		a.localeCompare(b),
	);
	const allProviderIds = normalizeProviderIds(args.providers, selectedProviderIds);
	const accountProviderIds = uniqStrings(args.accountProviderRestrictionProviderIds ?? []);
	const accountAllowedProviderIds = args.accountProviderRestrictionMode === "allowlist"
		? accountProviderIds
		: args.accountProviderRestrictionMode === "blocklist"
			? allProviderIds.filter((id) => !accountProviderIds.includes(id))
			: allProviderIds;

	const formAllowedProviderIds =
		args.providerRestrictionMode === "allowlist"
			? selectedProviderIds
			: allProviderIds.filter((providerId) => !selectedProviderIds.includes(providerId));
	const allowedProviderIds = formAllowedProviderIds.filter((id) => accountAllowedProviderIds.includes(id));

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
	const allModelIds = uniqStrings(args.activeProviderModels.map((route) => route.apiModelId))
		.sort((a, b) => a.localeCompare(b));
	const accountModelIds = uniqStrings(args.accountModelRestrictionModelIds ?? []);
	const accountAllowedModelIds = args.accountModelRestrictionMode === "allowlist"
		? accountModelIds
		: args.accountModelRestrictionMode === "blocklist"
			? allModelIds.filter((id) => !accountModelIds.includes(id))
			: allModelIds;

	const formAllowedModelIds =
		args.modelRestrictionMode === "allowlist"
			? selectedModelIds
			: providerVisibleModelIds.filter((modelId) => !selectedModelIds.includes(modelId));
	const allowedModelIds = formAllowedModelIds.filter((id) => accountAllowedModelIds.includes(id));

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
		blockedModelIds: allModelIds.filter((modelId) =>
			!finalRoutes.some((route) => route.apiModelId === modelId),
		),
		activeRouteCount: args.activeProviderModels.length,
		filteredRouteCount: finalRoutes.length,
	};
}
