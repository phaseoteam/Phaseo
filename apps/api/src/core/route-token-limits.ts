// Purpose: Read a route's catalogue output-token limit.
// Why: Unknown limits are stored as null, but some catalogue rows hold 0. A limit of
//      zero tokens is not a real limit: treating it as one rejected every request that
//      set max_tokens (all of /v1/messages) and clamped max_tokens to zero.
// How: Only a positive finite number is a limit; null, 0, negative and non-numeric
//      values mean "unknown", exactly like null.

export function routeOutputTokenLimit(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
