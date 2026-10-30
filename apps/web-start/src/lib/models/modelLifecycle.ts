export function hasPassedLifecycleDate(
	value: string | null | undefined,
): boolean {
	const normalized = String(value ?? "").trim();
	if (!normalized) return false;

	const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalized);
	const timestamp = Date.parse(
		hasExplicitTimezone ? normalized : `${normalized}Z`,
	);

	return Number.isFinite(timestamp) && timestamp <= Date.now();
}
