/** Contractual eligibility alone does not establish an active retention guarantee. */
export function resolveEnforcedZdr(
	providerGuarantee: boolean | null | undefined,
	eligibility: string | null | undefined,
	routeGuarantee?: boolean | null,
): boolean | null {
	if (eligibility === "ineligible") return false;
	if (typeof routeGuarantee === "boolean") return routeGuarantee;
	return providerGuarantee ?? null;
}

export function resolveScopedZdr(
	providerGuarantee: boolean | null | undefined,
	policies: Array<{ zdrEligibility?: string | null; zeroDataRetention?: boolean | null } | null | undefined>,
): boolean | null {
	if (!policies.length) return providerGuarantee ?? null;
	const values = policies.map((policy) =>
		resolveEnforcedZdr(providerGuarantee, policy?.zdrEligibility, policy?.zeroDataRetention),
	);
	return values.every((value) => value === values[0]) ? values[0]! : null;
}
