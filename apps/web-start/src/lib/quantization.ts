export function normalizeQuantizationScheme(
	value: string | null | undefined,
): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	if (!normalized) return null;
	return normalized.toUpperCase();
}
