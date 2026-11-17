// Providers name their tiers differently (Moonshot "Highspeed", Baseten
// "Ultrafast"…). A provider can override the generic name for a tier through
// `v2_providers.metadata.service_tier_labels`, e.g. { "priority": "Highspeed" }.
// Only per-provider surfaces use this; anything that spans several providers
// keeps the generic name ("Fast").

export type ProviderServiceTierLabels = Record<string, string> | null | undefined;

export function getProviderServiceTierLabel(
	labels: ProviderServiceTierLabels,
	plan: string | null | undefined,
): string | null {
	if (!labels || typeof labels !== "object") return null;
	const normalizedPlan = String(plan ?? "").trim().toLowerCase();
	if (!normalizedPlan) return null;
	const aliases = normalizedPlan === "fast" ? ["fast", "priority"] : normalizedPlan === "priority" ? ["priority", "fast"] : [normalizedPlan];
	for (const key of aliases) {
		const value = labels[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return null;
}
