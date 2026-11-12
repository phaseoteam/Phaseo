/** Expiry is enforced after reading cached responses, as well as in database projections. */
export function currentCatalogDataPolicy<T extends { catalogManaged?: boolean; validUntil?: string | null; zeroDataRetention?: boolean | null }>(policy: T | null | undefined): T | null | undefined {
	if (policy?.catalogManaged !== true) return policy;
	const deadline = typeof policy.validUntil === "string" ? Date.parse(policy.validUntil) : NaN;
	if (Number.isFinite(deadline) && deadline > Date.now()) return policy;
	return { ...policy, tier: "unknown", confidence: "unknown", zeroDataRetention: false, zdrEligibility: "ineligible", retentionMode: "unknown", retentionDays: null, trainingPolicy: "unknown" };
}
