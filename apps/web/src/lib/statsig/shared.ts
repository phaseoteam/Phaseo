import type { StatsigUser } from "@statsig/react-bindings";

export const STATSIG_STABLE_ID_COOKIE = "ai_stats_statsig_stable_id";
export const BETA_OPT_IN_STORAGE_KEY = "ai_stats_beta_opt_in";
export const BETA_PROFILE_STORAGE_KEY = "ai_stats_beta_profile";
export const BETA_OPT_IN_CHANGED_EVENT = "ai-stats-beta-opt-in-changed";
export const BETA_PROFILE_CHANGED_EVENT = "ai-stats-beta-profile-changed";
export const NEW_LANDING_PAGE_GATE =
	process.env.NEXT_PUBLIC_STATSIG_LANDING_PAGE_GATE ??
	process.env.NEXT_PUBLIC_STATSIG_GATEWAY_HERO_GATE ??
	"gateway_new_hero";
export const NEW_LANDING_PAGE_EXPERIMENT =
	process.env.NEXT_PUBLIC_STATSIG_LANDING_PAGE_EXPERIMENT ??
	process.env.NEXT_PUBLIC_STATSIG_GATEWAY_HERO_EXPERIMENT ??
	"gateway_hero_experiment";
export const GATEWAY_IO_LOGGING_GATE =
	process.env.NEXT_PUBLIC_STATSIG_GATEWAY_IO_LOGGING_GATE ??
	"gateway_io_logging";
export const PRESET_EXPERIMENTS_GATE =
	process.env.NEXT_PUBLIC_STATSIG_PRESET_EXPERIMENTS_GATE ??
	"preset_experiments";
export const NEW_GATEWAY_HERO_GATE = NEW_LANDING_PAGE_GATE;
export const NEW_GATEWAY_HERO_EXPERIMENT = NEW_LANDING_PAGE_EXPERIMENT;

export type FeatureGateLifecycleStage = "internal" | "beta" | "ga";

export const STATSIG_INTERNAL_SEGMENT_NAME = "Internal";
export const DEFAULT_GA_DIRECTORY_DAYS = 21;

const FEATURE_STAGE_SORT_ORDER = {
	ga: 0,
	beta: 1,
	internal: 2,
} satisfies Record<FeatureGateLifecycleStage, number>;

export function isFeatureDirectoryStage(
	stage: FeatureGateLifecycleStage
): boolean {
	return stage === "internal" || stage === "beta";
}

export type WebFeatureGate = {
	key: string;
	kind: "toggle" | "range";
	stage: FeatureGateLifecycleStage;
	title: string;
	description: string;
	gaReleasedAt?: string;
	gaDirectoryDays?: number;
	details?: readonly string[];
	blogPost?: {
		href: string;
		label?: string;
	};
};

export const WEB_FEATURE_GATES = [
	{
		key: GATEWAY_IO_LOGGING_GATE,
		kind: "toggle",
		stage: "internal",
		title: "Gateway I/O logging",
		description:
			"Capture request and response payloads for gateway generations with workspace-scoped retention controls.",
		details: [
			"Stores large payloads in R2 while keeping request ownership and lookup metadata in Supabase.",
			"Adds request-detail visibility for debugging model inputs, outputs, and provider behavior.",
			"Kept internal while retention, billing, and redaction controls are validated.",
		],
	},
	{
		key: PRESET_EXPERIMENTS_GATE,
		kind: "toggle",
		stage: "beta",
		title: "Preset experiments",
		description:
			"Enable preset experiment management, feedback comparison pages, and cohort analysis for your account.",
		details: [
			"Create preset test runs and compare candidate presets against a baseline.",
			"Use feedback API events and scores to compare preset performance over time.",
			"Segment results by bounded custom metadata such as customer tier, plan, or cohort.",
		],
	},
] as const satisfies readonly WebFeatureGate[];

export type WebFeatureGateKey = (typeof WEB_FEATURE_GATES)[number]["key"];

export const WEB_BETA_FEATURES = WEB_FEATURE_GATES.filter(
	(feature) => isFeatureDirectoryStage(feature.stage),
);

export function getWebFeatureGate(
	featureKey: string
): WebFeatureGate | undefined {
	return WEB_FEATURE_GATES.find(
		(feature) => feature.key === featureKey
	) as WebFeatureGate | undefined;
}

export function compareWebFeatureGates(
	a: WebFeatureGate,
	b: WebFeatureGate
): number {
	const stageOrder =
		FEATURE_STAGE_SORT_ORDER[a.stage] - FEATURE_STAGE_SORT_ORDER[b.stage];
	if (stageOrder !== 0) return stageOrder;
	return a.title.localeCompare(b.title);
}

export function shouldShowGaFeatureInDirectory(
	feature: WebFeatureGate,
	now = new Date()
): boolean {
	if (feature.stage !== "ga") return false;
	if (!feature.gaReleasedAt) return false;

	const releasedAt = new Date(feature.gaReleasedAt);
	if (Number.isNaN(releasedAt.getTime())) return false;

	const visibleDays = feature.gaDirectoryDays ?? DEFAULT_GA_DIRECTORY_DAYS;
	const visibleUntil = new Date(releasedAt);
	visibleUntil.setDate(visibleUntil.getDate() + visibleDays);

	return now >= releasedAt && now < visibleUntil;
}

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
