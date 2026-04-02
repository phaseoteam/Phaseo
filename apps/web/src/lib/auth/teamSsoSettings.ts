export type TeamSsoMode = "none" | "saml" | "custom_oidc";

export type TeamSsoSettingsInput = {
	ssoEnabled: boolean;
	ssoEnforced: boolean;
	ssoMode: TeamSsoMode;
	ssoProviderIdentifier?: string | null;
	ssoDomains: string[];
};

export type TeamSsoSettingsRow = {
	sso_enabled?: boolean | null;
	sso_enforced?: boolean | null;
	sso_mode?: string | null;
	sso_provider_identifier?: string | null;
	sso_domains?: string[] | null;
};

const DOMAIN_PATTERN =
	/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function normalizeDomain(raw: string): string | null {
	const normalized = raw.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
	if (!normalized) return null;
	if (!DOMAIN_PATTERN.test(normalized)) return null;
	return normalized;
}

export function normalizeSsoDomains(domains: string[]): string[] {
	const normalized = domains
		.map((domain) => normalizeDomain(domain))
		.filter((domain): domain is string => Boolean(domain));
	return [...new Set(normalized)];
}

export function normalizeTeamSsoMode(value: unknown): TeamSsoMode {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (normalized === "saml") return "saml";
	if (normalized === "custom_oidc") return "custom_oidc";
	return "none";
}

export function normalizeTeamSsoSettingsInput(
	input: TeamSsoSettingsInput,
): TeamSsoSettingsInput {
	const ssoMode = normalizeTeamSsoMode(input.ssoMode);
	const ssoEnabled = Boolean(input.ssoEnabled);
	const ssoEnforced = ssoEnabled ? Boolean(input.ssoEnforced) : false;
	const ssoDomains = normalizeSsoDomains(input.ssoDomains);
	const providerIdentifier = String(input.ssoProviderIdentifier ?? "").trim();

	let ssoProviderIdentifier: string | null = providerIdentifier || null;
	if (ssoMode === "none") {
		ssoProviderIdentifier = null;
	}
	if (ssoMode === "custom_oidc" && ssoProviderIdentifier) {
		if (!ssoProviderIdentifier.startsWith("custom:")) {
			throw new Error("Custom OIDC provider identifiers must start with `custom:`.");
		}
	}

	return {
		ssoEnabled,
		ssoEnforced,
		ssoMode,
		ssoProviderIdentifier,
		ssoDomains,
	};
}
