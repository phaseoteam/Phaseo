/**
 * The three per-attempt provider metrics, in display order. Shown as
 * "Reachable", "Accepted" and "Completed": a funnel where each rate is of the
 * attempts that passed the step before it.
 */
export const PROVIDER_HEALTH_METRICS = ["reachability", "capacity", "callErrors"] as const;
export type ProviderHealthMetric = (typeof PROVIDER_HEALTH_METRICS)[number];

export type AttemptFunnelCounts = {
	eligibleAttempts: number;
	reachabilityFailures: number;
	capacityFailures: number;
	callErrorFailures: number;
};

/**
 * What each metric's failures are out of: all eligible attempts for
 * reachable, those that reached the provider for accepted, and those it
 * accepted for completed. For example 2 of 340 couldn't reach it, 5 of 338
 * were turned away, 1 of 333 failed after it accepted them. Matches the rates
 * web-api and get_v2_model_provider_attempt_health compute.
 */
export function attemptFunnel(counts: AttemptFunnelCounts): Record<ProviderHealthMetric, { failed: number; of: number }> {
	const reached = Math.max(0, counts.eligibleAttempts - counts.reachabilityFailures);
	const accepted = Math.max(0, reached - counts.capacityFailures);
	return {
		reachability: { failed: counts.reachabilityFailures, of: counts.eligibleAttempts },
		capacity: { failed: counts.capacityFailures, of: reached },
		callErrors: { failed: counts.callErrorFailures, of: accepted },
	};
}
