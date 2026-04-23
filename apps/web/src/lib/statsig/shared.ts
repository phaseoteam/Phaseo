import type { StatsigUser } from "@statsig/react-bindings";

export const STATSIG_STABLE_ID_COOKIE = "ai_stats_statsig_stable_id";
export const BETA_OPT_IN_STORAGE_KEY = "ai_stats_beta_opt_in";
export const BETA_OPT_IN_CHANGED_EVENT = "ai-stats-beta-opt-in-changed";
export const NEW_GATEWAY_HERO_GATE =
	process.env.NEXT_PUBLIC_STATSIG_GATEWAY_HERO_GATE ?? "gateway_new_hero";

export type StatsigProfile = {
	betaOptIn: boolean;
	betaFeatures: Record<string, unknown>;
};

export const EMPTY_STATSIG_PROFILE: StatsigProfile = {
	betaOptIn: false,
	betaFeatures: {},
};

export function normalizeBetaFeatures(
	value: unknown
): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	return value as Record<string, unknown>;
}

export function buildAnonymousStatsigUser(
	stableID: string,
	profile: Partial<StatsigProfile> = {}
): StatsigUser {
	const betaFeatures = profile.betaFeatures ?? {};

	return {
		customIDs: {
			stableID,
			anonymousID: stableID,
		},
		custom: {
			betaOptIn: profile.betaOptIn ?? false,
			betaFeatureKeys: Object.keys(betaFeatures),
		},
	};
}

export function buildAuthenticatedStatsigUser(
	authUser: {
		id: string;
		email?: string | null;
	},
	stableID: string,
	profile: StatsigProfile
): StatsigUser {
	return {
		userID: authUser.id,
		email: authUser.email ?? undefined,
		customIDs: {
			stableID,
			anonymousID: stableID,
			supabaseUserID: authUser.id,
		},
		custom: {
			betaOptIn: profile.betaOptIn,
			betaFeatureKeys: Object.keys(profile.betaFeatures),
		},
	};
}

export function readStoredBetaOptIn(): boolean {
	if (typeof window === "undefined") return false;
	return window.localStorage.getItem(BETA_OPT_IN_STORAGE_KEY) === "true";
}

export function writeStoredBetaOptIn(value: boolean): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(BETA_OPT_IN_STORAGE_KEY, value ? "true" : "false");
}

export function readStableIdCookie(): string | null {
	if (typeof document === "undefined") return null;

	const encodedName = `${STATSIG_STABLE_ID_COOKIE}=`;
	for (const part of document.cookie.split(";")) {
		const trimmed = part.trim();
		if (!trimmed.startsWith(encodedName)) continue;
		return decodeURIComponent(trimmed.slice(encodedName.length));
	}

	return null;
}

export function writeStableIdCookie(stableID: string): void {
	if (typeof document === "undefined" || !stableID) return;

	const maxAgeSeconds = 60 * 60 * 24 * 365 * 2;
	document.cookie =
		`${STATSIG_STABLE_ID_COOKIE}=${encodeURIComponent(stableID)}; ` +
		`Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}
