// Coming-soon models are shown alongside live ones so new launches are
// discoverable before their routes go live; the card marks them clearly.
const DEFAULT_GATEWAY_STATUSES = ["active", "coming_soon"] as const;

export function resolveDefaultGatewayStatuses<T extends string>(
	selectedStatuses: readonly T[],
	hasInteractedWithStatuses: boolean,
): T[] {
	if (hasInteractedWithStatuses || selectedStatuses.length > 0) {
		return [...selectedStatuses];
	}

	return [...DEFAULT_GATEWAY_STATUSES] as T[];
}
