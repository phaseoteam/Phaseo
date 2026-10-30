const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSEY_VALUES = new Set(["0", "false", "no", "off"]);

export const THIRD_PARTY_OAUTH_COMING_SOON_MESSAGE =
	"OAuth client management is disabled for this deployment.";

export function isThirdPartyOAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	const configured = String(env.PHASEO_THIRD_PARTY_OAUTH_ENABLED ?? "").trim().toLowerCase();
	if (FALSEY_VALUES.has(configured)) return false;
	return configured === "" || TRUTHY_VALUES.has(configured);
}
