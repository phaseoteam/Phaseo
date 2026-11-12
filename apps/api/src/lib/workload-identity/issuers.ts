// Purpose: Identify which external OIDC issuers the gateway may trust.
// Why: JWKS URLs come from token input, so they must never be fetched for an
// issuer outside a fixed allowlist or a workspace's own configured issuer (SSRF).
// How: Each preset platform matches a fixed host and maps to a fixed JWKS URL.
// Any other public https issuer is "custom": its JWKS URL comes from its OIDC
// discovery document and must stay on the issuer's host.

export const WORKLOAD_IDENTITY_PROVIDERS = [
	"vercel",
	"github_actions",
	"gitlab",
	"google_cloud",
	"buildkite",
	"circleci",
	"aws",
	"custom",
] as const;
export type WorkloadIdentityProvider = (typeof WORKLOAD_IDENTITY_PROVIDERS)[number];
export type PresetWorkloadIdentityProvider = Exclude<WorkloadIdentityProvider, "custom">;

export function isWorkloadIdentityProvider(value: unknown): value is WorkloadIdentityProvider {
	return typeof value === "string" && (WORKLOAD_IDENTITY_PROVIDERS as readonly string[]).includes(value);
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

type Preset = {
	issuer: RegExp;
	/** Hosts reserved for this preset; custom issuers may not use them. */
	hosts: RegExp;
	jwksUrl(issuer: string): string;
};

// JWKS URLs from each issuer's discovery document (checked 2026-10-26 and 2026-11-02).
const PRESETS: Record<PresetWorkloadIdentityProvider, Preset> = {
	// Vercel team mode: https://oidc.vercel.com/<team-slug>; global mode has no path.
	vercel: {
		issuer: /^https:\/\/oidc\.vercel\.com(?:\/[a-z0-9][a-z0-9_-]{0,99})?$/,
		hosts: /^oidc\.vercel\.com$/,
		// Vercel publishes a key set per team issuer.
		jwksUrl: (issuer) => `${issuer}/.well-known/jwks`,
	},
	// GitHub Enterprise Cloud can customise the issuer with an enterprise slug.
	github_actions: {
		issuer: /^https:\/\/token\.actions\.githubusercontent\.com(?:\/[a-z0-9][a-z0-9_-]{0,99})?$/,
		hosts: /^token\.actions\.githubusercontent\.com$/,
		// Enterprise issuers advertise the global key set; `<issuer>/.well-known/jwks` is a 404.
		jwksUrl: () => "https://token.actions.githubusercontent.com/.well-known/jwks",
	},
	// GitLab.com only; self-managed GitLab uses a custom issuer.
	gitlab: {
		issuer: /^https:\/\/gitlab\.com$/,
		hosts: /^gitlab\.com$/,
		jwksUrl: () => "https://gitlab.com/oauth/discovery/keys",
	},
	// Google-signed ID tokens from the metadata server (Cloud Run, GCE, GKE, Cloud Functions).
	google_cloud: {
		issuer: /^https:\/\/accounts\.google\.com$/,
		hosts: /^accounts\.google\.com$/,
		jwksUrl: () => "https://www.googleapis.com/oauth2/v3/certs",
	},
	buildkite: {
		issuer: /^https:\/\/agent\.buildkite\.com$/,
		hosts: /^agent\.buildkite\.com$/,
		jwksUrl: () => "https://agent.buildkite.com/.well-known/jwks",
	},
	// One issuer per CircleCI organization.
	circleci: {
		issuer: new RegExp(`^https:\\/\\/oidc\\.circleci\\.com\\/org\\/${UUID}$`),
		hosts: /^oidc\.circleci\.com$/,
		jwksUrl: (issuer) => `${issuer}/.well-known/jwks-pub.json`,
	},
	// IAM outbound identity federation: one issuer per AWS account.
	aws: {
		issuer: new RegExp(`^https:\\/\\/${UUID}\\.tokens\\.sts\\.global\\.api\\.aws$`),
		hosts: /(?:^|\.)tokens\.sts\.global\.api\.aws$/,
		jwksUrl: (issuer) => `${issuer}/.well-known/jwks.json`,
	},
};

const PRESET_ENTRIES = Object.entries(PRESETS) as Array<[PresetWorkloadIdentityProvider, Preset]>;

export function presetProviderForIssuer(issuer: string): PresetWorkloadIdentityProvider | null {
	for (const [provider, preset] of PRESET_ENTRIES) {
		if (preset.issuer.test(issuer)) return provider;
	}
	return null;
}

const MAX_CUSTOM_ISSUER_LENGTH = 256;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const LOCAL_HOST = /(?:^|\.)(?:localhost|local|internal|localdomain|home\.arpa)$/;

/**
 * A public https issuer the gateway may discover keys for once a policy names
 * it: no IP literals, ports, credentials, query or fragment, and never a host
 * that belongs to a preset (those need the preset's pinned owner claim).
 */
export function isCustomIssuer(issuer: string): boolean {
	if (issuer.length === 0 || issuer.length > MAX_CUSTOM_ISSUER_LENGTH || issuer !== issuer.trim()) return false;
	let url: URL;
	try {
		url = new URL(issuer);
	} catch {
		return false;
	}
	if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return false;
	// The token's `iss` must match exactly, so only accept the normalised form.
	if (url.href !== issuer && url.href !== `${issuer}/`) return false;
	const host = url.hostname;
	if (!host.includes(".") || host.startsWith("[") || IPV4.test(host) || LOCAL_HOST.test(host)) return false;
	return !PRESET_ENTRIES.some(([, preset]) => preset.hosts.test(host));
}

export function providerForIssuer(issuer: string): WorkloadIdentityProvider | null {
	return presetProviderForIssuer(issuer) ?? (isCustomIssuer(issuer) ? "custom" : null);
}

/** Fixed JWKS URL for a preset issuer; custom issuers use discovery. */
export function jwksUrlForIssuer(issuer: string, provider: WorkloadIdentityProvider): string | null {
	if (provider === "custom" || presetProviderForIssuer(issuer) !== provider) return null;
	return PRESETS[provider].jwksUrl(issuer);
}

export function discoveryUrlForIssuer(issuer: string): string | null {
	if (!isCustomIssuer(issuer)) return null;
	return `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
}

/** A discovered JWKS URL must be https on the issuer's own host. */
export function isAllowedDiscoveredJwksUrl(issuer: string, jwksUri: unknown): jwksUri is string {
	if (typeof jwksUri !== "string" || jwksUri.length > 1024) return false;
	try {
		const jwks = new URL(jwksUri);
		const iss = new URL(issuer);
		return jwks.protocol === "https:" && !jwks.username && !jwks.password && !jwks.port && jwks.hostname === iss.hostname;
	} catch {
		return false;
	}
}
