import {
	inferProviderFamilyIdFromSiblings,
	resolveProviderDisplayName,
	type ProviderOfferScope,
} from "@/lib/providers/providerOffers";

export type ProviderModalityKey =
	| "text"
	| "image"
	| "video"
	| "audio"
	| "moderation"
	| "embedding";

export type ProviderModalitySupport = Record<
	ProviderModalityKey,
	{
		input: number;
		output: number;
	}
>;

export interface APIProviderCard {
	api_provider_id: string;
	api_provider_name: string;
	colour?: string | null;
	country_code: string;
	last_updated_at?: string | null;
	total_models: number;
	active_models: number;
	free_models: number;
	total_daily_tokens: number;
	total_monthly_tokens: number;
	daily_share_pct: number;
	modality_support: ProviderModalitySupport;
}

export interface APIProviderIndexVariant {
	api_provider_id: string;
	api_provider_name: string;
	colour?: string | null;
	country_code: string;
	provider_family_id?: string | null;
	offer_label?: string | null;
	offer_scope?: ProviderOfferScope | null;
	total_model_ids: string[];
	active_model_ids: string[];
	free_model_ids: string[];
	total_daily_requests: number;
	total_daily_tokens: number;
	total_monthly_tokens: number;
	last_updated_at?: string | null;
	modality_model_ids: Record<
		ProviderModalityKey,
		{
			input: string[];
			output: string[];
		}
	>;
}

function createEmptyModalitySupport(): ProviderModalitySupport {
	return {
		text: { input: 0, output: 0 },
		image: { input: 0, output: 0 },
		video: { input: 0, output: 0 },
		audio: { input: 0, output: 0 },
		moderation: { input: 0, output: 0 },
		embedding: { input: 0, output: 0 },
	};
}

function uniqueStrings(values: Iterable<string>): string[] {
	return Array.from(
		new Set(
			Array.from(values)
				.map((value) => String(value ?? "").trim())
				.filter(Boolean),
		),
	);
}

function pickLatestIsoDate(values: Array<string | null | undefined>): string | null {
	let latest: string | null = null;
	let latestMs = Number.NEGATIVE_INFINITY;

	for (const value of values) {
		if (!value) continue;
		const parsed = Date.parse(value);
		if (!Number.isFinite(parsed) || parsed <= latestMs) continue;
		latestMs = parsed;
		latest = value;
	}

	return latest;
}

function getRegionalParentProviderId(
	variant: APIProviderIndexVariant,
	variantsById: Map<string, APIProviderIndexVariant>,
	allVariants: APIProviderIndexVariant[],
): string {
	if (variant.offer_scope !== "regional") {
		return variant.api_provider_id;
	}

	const inferredBaseId = inferProviderFamilyIdFromSiblings({
		providerId: variant.api_provider_id,
		knownProviderIds: variantsById.keys(),
	});
	if (inferredBaseId && variantsById.has(inferredBaseId)) {
		return inferredBaseId;
	}

	const sameFamilySiblings = allVariants.filter(
		(candidate) =>
			candidate.api_provider_id !== variant.api_provider_id &&
			candidate.provider_family_id &&
			candidate.provider_family_id === variant.provider_family_id &&
			candidate.offer_scope !== "regional",
	);
	if (sameFamilySiblings.length === 0) {
		return variant.api_provider_id;
	}

	const normalizedOfferLabel = String(variant.offer_label ?? "")
		.trim()
		.toLowerCase();
	if (normalizedOfferLabel) {
		const matchingSpecializedSiblings = sameFamilySiblings.filter((candidate) => {
			const siblingOfferLabel = String(candidate.offer_label ?? "")
				.trim()
				.toLowerCase();
			return siblingOfferLabel && normalizedOfferLabel.startsWith(siblingOfferLabel);
		});
		if (matchingSpecializedSiblings.length === 1) {
			return matchingSpecializedSiblings[0].api_provider_id;
		}
	}

	const globalSibling = sameFamilySiblings.find(
		(candidate) => candidate.offer_scope === "global",
	);
	if (globalSibling) {
		return globalSibling.api_provider_id;
	}

	if (sameFamilySiblings.length === 1) {
		return sameFamilySiblings[0].api_provider_id;
	}

	return variant.api_provider_id;
}

function getRepresentativeProvider(
	groupKey: string,
	variants: APIProviderIndexVariant[],
): APIProviderIndexVariant {
	const exactMatch = variants.find(
		(variant) => variant.api_provider_id === groupKey,
	);
	if (exactMatch) {
		return exactMatch;
	}

	return [...variants].sort((a, b) => {
		const aPriority = a.offer_scope === "global" ? 0 : 1;
		const bPriority = b.offer_scope === "global" ? 0 : 1;
		if (aPriority !== bPriority) return aPriority - bPriority;
		return a.api_provider_id.localeCompare(b.api_provider_id);
	})[0];
}

export function groupProviderIndexCards(
	variants: APIProviderIndexVariant[],
): APIProviderCard[] {
	if (variants.length === 0) return [];

	const variantsById = new Map(
		variants.map((variant) => [variant.api_provider_id, variant]),
	);
	const groupedVariants = new Map<string, APIProviderIndexVariant[]>();

	for (const variant of variants) {
		const groupKey = getRegionalParentProviderId(
			variant,
			variantsById,
			variants,
		);
		const existing = groupedVariants.get(groupKey) ?? [];
		existing.push(variant);
		groupedVariants.set(groupKey, existing);
	}

	const totalDailyRequests = variants.reduce(
		(sum, variant) => sum + Math.max(0, Number(variant.total_daily_requests ?? 0)),
		0,
	);

	return Array.from(groupedVariants.entries()).map(([groupKey, group]) => {
		const representative = getRepresentativeProvider(groupKey, group);
		const totalModelIds = uniqueStrings(
			group.flatMap((variant) => variant.total_model_ids),
		);
		const activeModelIds = uniqueStrings(
			group.flatMap((variant) => variant.active_model_ids),
		);
		const freeModelIds = uniqueStrings(
			group.flatMap((variant) => variant.free_model_ids),
		);
		const modalitySupport = createEmptyModalitySupport();
		for (const key of Object.keys(modalitySupport) as ProviderModalityKey[]) {
			modalitySupport[key].input = uniqueStrings(
				group.flatMap((variant) => variant.modality_model_ids[key].input),
			).length;
			modalitySupport[key].output = uniqueStrings(
				group.flatMap((variant) => variant.modality_model_ids[key].output),
			).length;
		}

		const totalGroupDailyRequests = group.reduce(
			(sum, variant) =>
				sum + Math.max(0, Number(variant.total_daily_requests ?? 0)),
			0,
		);

		return {
			api_provider_id: representative.api_provider_id,
			api_provider_name: resolveProviderDisplayName({
				providerId: representative.api_provider_id,
				providerName: representative.api_provider_name,
			}),
			colour: representative.colour ?? null,
			country_code: representative.country_code,
			total_models: totalModelIds.length,
			active_models: activeModelIds.length,
			free_models: freeModelIds.length,
			total_daily_tokens: group.reduce(
				(sum, variant) => sum + Math.max(0, Number(variant.total_daily_tokens ?? 0)),
				0,
			),
			total_monthly_tokens: group.reduce(
				(sum, variant) =>
					sum + Math.max(0, Number(variant.total_monthly_tokens ?? 0)),
				0,
			),
			last_updated_at: pickLatestIsoDate(
				group.map((variant) => variant.last_updated_at ?? null),
			),
			daily_share_pct:
				totalDailyRequests > 0
					? (totalGroupDailyRequests / totalDailyRequests) * 100
					: 0,
			modality_support: modalitySupport,
		};
	});
}
