export type GoogleServiceTier = "standard" | "flex" | "priority";

/** Normalize Gemini serviceTier values and Vertex usageMetadata.trafficType. */
export function normalizeGoogleServiceTier(value: unknown): GoogleServiceTier | undefined {
	if (typeof value !== "string") return undefined;
	switch (value.trim().toLowerCase()) {
		case "standard":
		case "default":
		case "unspecified":
		case "on_demand":
			return "standard";
		case "flex":
		case "on_demand_flex":
			return "flex";
		case "fast":
		case "priority":
		case "on_demand_priority":
			return "priority";
		default:
			return undefined;
	}
}
