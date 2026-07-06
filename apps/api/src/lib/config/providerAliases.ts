// Purpose: Normalize provider identifiers used in gateway config and routing hints.
// Why: Keep request/provider ids aligned with the canonical ids used in catalog-backed routing data.
// How: Apply strict normalization first, then collapse known brand/legacy aliases onto their canonical provider ids.

const PROVIDER_ID_ALIASES = new Map<string, string>([
	["novitaai", "novita"],
	["novita-ai", "novita"],
	["spacex-ai", "x-ai"],
]);

export function normalizeProviderId(value: string): string {
	const normalized = value.trim().toLowerCase();
	return PROVIDER_ID_ALIASES.get(normalized) ?? normalized;
}

export function normalizeProviderList(values?: string[] | null): string[] {
	if (!Array.isArray(values)) return [];
	return values.map((value) => normalizeProviderId(String(value)));
}
