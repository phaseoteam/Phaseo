import type { StatsigUser } from "@statsig/react-bindings";

export const STATSIG_STABLE_ID_COOKIE = "ai_stats_statsig_stable_id";
export const BETA_OPT_IN_STORAGE_KEY = "ai_stats_beta_opt_in";
export const BETA_PROFILE_STORAGE_KEY = "ai_stats_beta_profile";
export const BETA_OPT_IN_CHANGED_EVENT = "ai-stats-beta-opt-in-changed";
export const BETA_PROFILE_CHANGED_EVENT = "ai-stats-beta-profile-changed";
export const NEW_GATEWAY_HERO_GATE =
	process.env.NEXT_PUBLIC_STATSIG_GATEWAY_HERO_GATE ?? "gateway_new_hero";
export const NEW_GATEWAY_HERO_EXPERIMENT =
	process.env.NEXT_PUBLIC_STATSIG_GATEWAY_HERO_EXPERIMENT ??
	"gateway_hero_experiment";

export const WEB_BETA_FEATURES = [
	{
		key: NEW_GATEWAY_HERO_GATE,
		kind: "toggle",
		title: "New homepage hero",
		description:
			"Replaces the current homepage hero with a more gateway-led headline, updated supporting copy, and stronger routing-first emphasis.",
	},
] as const;

export type WebBetaFeatureKey = (typeof WEB_BETA_FEATURES)[number]["key"];
export type GatewayHeroVariant = "classic" | "experimental";

export type StatsigProfile = {
	betaOptIn: boolean;
	betaFeatures: Record<string, boolean>;
};

export const EMPTY_STATSIG_PROFILE: StatsigProfile = {
	betaOptIn: false,
	betaFeatures: {},
};

export function normalizeBetaFeatures(
	value: unknown
): Record<string, boolean> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, boolean] =>
			typeof entry[1] === "boolean"
		)
	);
}

export function getEnabledBetaFeatureKeys(
	betaFeatures: Record<string, boolean>
): string[] {
	return Object.entries(betaFeatures)
		.filter(([, enabled]) => enabled)
		.map(([key]) => key);
}

export function isBetaFeatureEnabled(
	profile: StatsigProfile,
	featureKey: string
): boolean {
	return profile.betaFeatures[featureKey] === true;
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
			betaFeatureKeys: getEnabledBetaFeatureKeys(betaFeatures),
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
			betaFeatureKeys: getEnabledBetaFeatureKeys(profile.betaFeatures),
		},
	};
}

export function readStoredBetaProfile(): StatsigProfile {
	if (typeof window === "undefined") return EMPTY_STATSIG_PROFILE;

	try {
		const raw = window.localStorage.getItem(BETA_PROFILE_STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<StatsigProfile>;
			return {
				betaOptIn: Boolean(parsed.betaOptIn),
				betaFeatures: normalizeBetaFeatures(parsed.betaFeatures),
			};
		}
	} catch {
		// Ignore malformed local storage and fall back to the legacy key.
	}

	try {
		return {
			betaOptIn:
				window.localStorage.getItem(BETA_OPT_IN_STORAGE_KEY) === "true",
			betaFeatures: {},
		};
	} catch {
		return EMPTY_STATSIG_PROFILE;
	}
}

export function readStoredBetaOptIn(): boolean {
	return readStoredBetaProfile().betaOptIn;
}

export function writeStoredBetaOptIn(value: boolean): void {
	writeStoredBetaProfile({
		...readStoredBetaProfile(),
		betaOptIn: value,
	});
}

export function writeStoredBetaProfile(profile: StatsigProfile): void {
	if (typeof window === "undefined") return;

	const normalizedProfile: StatsigProfile = {
		betaOptIn: Boolean(profile.betaOptIn),
		betaFeatures: normalizeBetaFeatures(profile.betaFeatures),
	};

	try {
		window.localStorage.setItem(
			BETA_PROFILE_STORAGE_KEY,
			JSON.stringify(normalizedProfile)
		);
		window.localStorage.setItem(
			BETA_OPT_IN_STORAGE_KEY,
			normalizedProfile.betaOptIn ? "true" : "false"
		);
	} catch {
		// Ignore storage access errors in privacy-focused browsers.
	}
}

export function dispatchStoredBetaProfileChanged(profile: StatsigProfile): void {
	if (typeof window === "undefined") return;

	window.dispatchEvent(
		new CustomEvent<StatsigProfile>(BETA_PROFILE_CHANGED_EVENT, {
			detail: profile,
		})
	);
	window.dispatchEvent(
		new CustomEvent<boolean>(BETA_OPT_IN_CHANGED_EVENT, {
			detail: profile.betaOptIn,
		})
	);
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
