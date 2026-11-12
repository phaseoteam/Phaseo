export const ANALYTICS_IDENTITY_EVENT = "phaseo:analytics-identity";

// IDs only: never add email, name or other personal fields here.
export type AnalyticsIdentity = {
	userId: string;
	workspaceId: string | null;
	signedUpAt: string | null;
};

export function getAnalyticsIdentityKey(identity: AnalyticsIdentity | null): string {
	return identity ? `${identity.userId}|${identity.workspaceId ?? ""}|${identity.signedUpAt ?? ""}` : "anonymous";
}

/**
 * Publishes the signed-in identity (or null when signed out). The PostHog
 * client only applies it after analytics consent, so publishing is always safe.
 */
export function publishAnalyticsIdentity(identity: AnalyticsIdentity | null) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<AnalyticsIdentity | null>(ANALYTICS_IDENTITY_EVENT, {
			detail: identity,
		}),
	);
}
