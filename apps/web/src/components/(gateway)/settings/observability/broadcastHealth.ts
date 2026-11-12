export type BroadcastDestinationHealth = {
	lastSuccessAt: string | null;
	lastFailureAt: string | null;
	lastHttpStatus: number | null;
	lastError: string | null;
	consecutiveFailures: number;
	delivered24h: number;
	failed24h: number;
};

export type BroadcastHealthState = "disabled" | "idle" | "healthy" | "failing";

// A destination is failing while its most recent export requests have failed;
// the next successful request makes it healthy again.
export function broadcastHealthState(enabled: boolean, health: BroadcastDestinationHealth | null | undefined): BroadcastHealthState {
	if (!enabled) return "disabled";
	if (!health || (!health.lastSuccessAt && !health.lastFailureAt)) return "idle";
	return health.consecutiveFailures > 0 ? "failing" : "healthy";
}
