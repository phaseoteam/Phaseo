import { resolveProviderDisplayName, resolveProviderLogoId } from "@/lib/providers/providerOffers";

export type ProviderOption = {
	id: string;
	name: string;
	status: string;
	isActive: boolean;
	// What sets this route apart from the provider's standard one: a region
	// code ("eu", "jp"), "global", "zdr" or "e2ee". Null for the standard route.
	variant: string | null;
};

// Route suffixes that are not CLDR region codes, mapped to ones that are.
const REGION_CODE_ALIASES: Record<string, string> = { ams: "150", sgp: "SG", uk: "GB" };

export function variantRegionCode(variant: string): string {
	return REGION_CODE_ALIASES[variant] ?? variant.toUpperCase();
}

export type ProviderGroup = {
	key: string;
	name: string;
	logoId: string | null;
	status: string;
	isActive: boolean;
	options: ProviderOption[];
};

// Route suffixes for the same provider served from another region or under a
// different data policy, such as amazon-bedrock-eu or wafer-zdr. Fast tiers
// (-turbo, -lightning) are priced as separate offers, so they stay separate.
const VARIANT_SUFFIX = /-(global|zdr|e2ee|eu|ams|us|uk|au|jp|cn|kr|in|sg|sgp|ca|de|fr)$/;

const STATUS_ORDER = ["active", "coming_soon"];

function statusRank(option: { status: string; isActive: boolean }): number {
	const index = STATUS_ORDER.indexOf(option.isActive ? "active" : option.status);
	return index === -1 ? STATUS_ORDER.length : index;
}

function normalizeStatus(status: string | null | undefined, isActive: boolean): string {
	return String(status ?? (isActive ? "active" : "inactive"))
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
}

// Variant routes are often named after the region, as in "SiliconFlow (China)".
function stripVariantName(name: string): string {
	return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

export function groupProviders(
	details: ReadonlyArray<{ id?: string | null; name?: string | null; is_active?: boolean; status?: string | null }>,
): ProviderGroup[] {
	const options = new Map<string, ProviderOption>();
	for (const provider of details) {
		const name = String(provider.name ?? "").trim();
		if (!name) continue;
		const id = String(provider.id ?? "").trim();
		const key = id || name.toLowerCase();
		const isActive = Boolean(provider.is_active);
		const existing = options.get(key);
		if (existing?.isActive) continue;
		options.set(key, {
			id,
			name,
			status: normalizeStatus(provider.status, isActive),
			isActive: isActive || Boolean(existing?.isActive),
			variant: id.toLowerCase().match(VARIANT_SUFFIX)?.[1] ?? null,
		});
	}

	const groups = new Map<string, ProviderGroup>();
	for (const option of options.values()) {
		const key = option.variant
			? option.id.toLowerCase().slice(0, -(option.variant.length + 1))
			: option.id.toLowerCase() || option.name.toLowerCase();
		const group = groups.get(key);
		if (group) {
			group.options.push(option);
			// The standard route names the group when there is one.
			if (!option.variant) group.name = option.name;
			continue;
		}
		groups.set(key, {
			key,
			name: option.variant ? stripVariantName(option.name) : option.name,
			logoId: option.id
				? resolveProviderLogoId({ providerId: option.id, providerFamilyId: option.variant ? key : null })
				: null,
			status: option.status,
			isActive: option.isActive,
			options: [option],
		});
	}

	return Array.from(groups.values())
		.map((group) => {
			const sorted = [...group.options].sort(
				(a, b) =>
					statusRank(a) - statusRank(b) ||
					Number(Boolean(a.variant)) - Number(Boolean(b.variant)) ||
					String(a.variant).localeCompare(String(b.variant)),
			);
			const best = sorted[0];
			return {
				...group,
				name: group.options.length > 1 || group.options[0].variant
					? resolveProviderDisplayName({ providerId: group.key, providerName: group.name })
					: group.name,
				status: best.status,
				isActive: group.options.some((option) => option.isActive),
				options: sorted,
			};
		})
		.sort((a, b) => statusRank(a) - statusRank(b) || a.name.localeCompare(b.name));
}
