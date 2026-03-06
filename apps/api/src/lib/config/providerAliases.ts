// Purpose: Normalize provider identifiers used in gateway config and routing hints.
// Why: Keep provider IDs deterministic and aligned with canonical IDs in web data.
// How: Apply strict normalization only (trim + lowercase) without alias remapping.

export function normalizeProviderId(value: string): string {
	return value.trim().toLowerCase();
}

export function normalizeProviderList(values?: string[] | null): string[] {
	if (!Array.isArray(values)) return [];
	return values.map((value) => normalizeProviderId(String(value)));
}
