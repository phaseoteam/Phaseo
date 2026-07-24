import type { StatsigUser } from "@statsig/react-bindings";

export const STATSIG_STABLE_ID_COOKIE = "phaseo_statsig_stable_id";
const LEGACY_STATSIG_STABLE_ID_COOKIE = "ai_stats_statsig_stable_id";
export const BETA_OPT_IN_STORAGE_KEY = "phaseo_beta_opt_in";
const LEGACY_BETA_OPT_IN_STORAGE_KEY = "ai_stats_beta_opt_in";
export const BETA_PROFILE_STORAGE_KEY = "phaseo_beta_profile";
const LEGACY_BETA_PROFILE_STORAGE_KEY = "ai_stats_beta_profile";
export const BETA_OPT_IN_CHANGED_EVENT = "phaseo-beta-opt-in-changed";
const LEGACY_BETA_OPT_IN_CHANGED_EVENT = "ai-stats-beta-opt-in-changed";
export const BETA_PROFILE_CHANGED_EVENT = "phaseo-beta-profile-changed";
const LEGACY_BETA_PROFILE_CHANGED_EVENT = "ai-stats-beta-profile-changed";
export const NEW_LANDING_PAGE_GATE =
	process.env.NEXT_PUBLIC_STATSIG_LANDING_PAGE_GATE ??
	process.env.NEXT_PUBLIC_STATSIG_GATEWAY_HERO_GATE ??
	"gateway_new_hero";
export const NEW_LANDING_PAGE_EXPERIMENT =
	process.env.NEXT_PUBLIC_STATSIG_LANDING_PAGE_EXPERIMENT ??
	process.env.NEXT_PUBLIC_STATSIG_GATEWAY_HERO_EXPERIMENT ??
	"gateway_hero_experiment";
export const BATCH_API_GATE =
	process.env.NEXT_PUBLIC_STATSIG_BATCH_API_GATE ?? "gateway_batch_api";
export const VIDEO_API_GATE =
	process.env.NEXT_PUBLIC_STATSIG_VIDEO_API_GATE ?? "gateway_video_api";
export const REALTIME_VOICE_GATE =
	process.env.NEXT_PUBLIC_STATSIG_REALTIME_VOICE_GATE ?? "gateway_realtime_voice";
export const GATEWAY_IO_LOGGING_GATE =
	process.env.NEXT_PUBLIC_STATSIG_GATEWAY_IO_LOGGING_GATE ?? "gateway_io_logging";
export const NEW_GATEWAY_HERO_GATE = NEW_LANDING_PAGE_GATE;
export const NEW_GATEWAY_HERO_EXPERIMENT = NEW_LANDING_PAGE_EXPERIMENT;
export const REALTIME_VOICE_BETA_FEATURE = "chat_realtime_voice";

export const MODELS_CATALOGUE_V2_BETA_KEY = "models_catalogue_v2";

export type WebBetaFeatureDefinition = {
	key: string;
	kind?: "toggle" | "range";
	title: string;
	description: string;
	adminOnly?: boolean;
	selfService?: boolean;
};

export const WEB_BETA_FEATURES = [
	{
		key: MODELS_CATALOGUE_V2_BETA_KEY,
		kind: "toggle",
		title: "Models catalogue V2",
		description:
			"Load the Models page from the parallel V2 model, provider, capability, SKU, and rate tables.",
		adminOnly: true,
	},
	{
		key: REALTIME_VOICE_BETA_FEATURE,
		kind: "toggle",
		title: "Realtime voice room",
		description:
			"Enable the experimental voice-to-voice realtime room with live duration and cost tracking.",
		selfService: false,
		adminOnly: true,
	},
] as const satisfies readonly WebBetaFeatureDefinition[];

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

export function withAdminBetaFeatures(
	profile: StatsigProfile,
	isAdmin: boolean
): StatsigProfile {
	if (!isAdmin) return profile;

	return {
		betaOptIn: true,
		betaFeatures: {
			...profile.betaFeatures,
			[REALTIME_VOICE_BETA_FEATURE]: true,
		},
	};
}

export function withRealtimeVoiceEntitlement(
	profile: StatsigProfile,
	entitled: boolean,
): StatsigProfile {
	const betaFeatures = { ...profile.betaFeatures };
	if (entitled) betaFeatures[REALTIME_VOICE_BETA_FEATURE] = true;
	else delete betaFeatures[REALTIME_VOICE_BETA_FEATURE];
	return {
		betaOptIn: Object.keys(betaFeatures).length > 0,
		betaFeatures,
	};
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
		const raw =
			window.localStorage.getItem(BETA_PROFILE_STORAGE_KEY) ??
			window.localStorage.getItem(LEGACY_BETA_PROFILE_STORAGE_KEY);
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
				(
					window.localStorage.getItem(BETA_OPT_IN_STORAGE_KEY) ??
					window.localStorage.getItem(LEGACY_BETA_OPT_IN_STORAGE_KEY)
				) === "true",
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
	const previous = readStoredBetaProfile();
	writeStoredBetaProfile({
		...previous,
		betaOptIn: value,
		betaFeatures: value ? previous.betaFeatures : {},
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
		window.localStorage.removeItem(LEGACY_BETA_PROFILE_STORAGE_KEY);
		window.localStorage.removeItem(LEGACY_BETA_OPT_IN_STORAGE_KEY);
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
	window.dispatchEvent(
		new CustomEvent<StatsigProfile>(LEGACY_BETA_PROFILE_CHANGED_EVENT, {
			detail: profile,
		})
	);
	window.dispatchEvent(
		new CustomEvent<boolean>(LEGACY_BETA_OPT_IN_CHANGED_EVENT, {
			detail: profile.betaOptIn,
		})
	);
}

export function readStableIdCookie(): string | null {
	if (typeof document === "undefined") return null;

	const cookieNames = [
		STATSIG_STABLE_ID_COOKIE,
		LEGACY_STATSIG_STABLE_ID_COOKIE,
	];
	for (const part of document.cookie.split(";")) {
		const trimmed = part.trim();
		for (const cookieName of cookieNames) {
			const encodedName = `${cookieName}=`;
			if (!trimmed.startsWith(encodedName)) continue;
			return decodeURIComponent(trimmed.slice(encodedName.length));
		}
	}

	return null;
}

export function writeStableIdCookie(stableID: string): void {
	if (typeof document === "undefined" || !stableID) return;

	const maxAgeSeconds = 60 * 60 * 24 * 365 * 2;
	document.cookie =
		`${STATSIG_STABLE_ID_COOKIE}=${encodeURIComponent(stableID)}; ` +
		`Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
	document.cookie =
		`${LEGACY_STATSIG_STABLE_ID_COOKIE}=; ` +
		"Max-Age=0; Path=/; SameSite=Lax";
}
