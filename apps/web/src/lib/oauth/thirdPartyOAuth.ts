const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

export const THIRD_PARTY_OAUTH_COMING_SOON_MESSAGE =
	"OAuth client management is coming soon. The AI Stats CLI is available during the private OAuth beta.";

export function isThirdPartyOAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return TRUTHY_VALUES.has(String(env.AI_STATS_THIRD_PARTY_OAUTH_ENABLED ?? "").trim().toLowerCase());
}
