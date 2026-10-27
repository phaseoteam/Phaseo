// Purpose: Identify which external OIDC issuers the gateway may trust.
// Why: JWKS URLs come from token input, so they must never be fetched for an
// issuer outside a fixed allowlist (SSRF).
// How: Each supported platform matches a fixed host and maps to a fixed JWKS URL.

export type WorkloadIdentityProvider = "vercel" | "github_actions";

// Vercel team mode: https://oidc.vercel.com/<team-slug>; global mode has no path.
const VERCEL_ISSUER = /^https:\/\/oidc\.vercel\.com(?:\/[a-z0-9][a-z0-9_-]{0,99})?$/;
// GitHub Enterprise Cloud can customise the issuer with an enterprise slug.
const GITHUB_ACTIONS_ISSUER = /^https:\/\/token\.actions\.githubusercontent\.com(?:\/[a-z0-9][a-z0-9_-]{0,99})?$/;
// Enterprise issuers advertise the global key set; `<issuer>/.well-known/jwks` is a 404 (checked 2026-10-26).
const GITHUB_ACTIONS_JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";

export function presetProviderForIssuer(issuer: string): WorkloadIdentityProvider | null {
	if (VERCEL_ISSUER.test(issuer)) return "vercel";
	if (GITHUB_ACTIONS_ISSUER.test(issuer)) return "github_actions";
	return null;
}

/** JWKS URLs from each issuer's discovery document (checked 2026-10-26). */
export function jwksUrlForIssuer(issuer: string, provider: WorkloadIdentityProvider): string | null {
	if (presetProviderForIssuer(issuer) !== provider) return null;
	// Vercel publishes a key set per team issuer.
	return provider === "github_actions" ? GITHUB_ACTIONS_JWKS_URL : `${issuer}/.well-known/jwks`;
}
