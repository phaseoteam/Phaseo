/**
 * Whether a request's key ID is really an OAuth client ID. Only OAuth access tokens
 * (`apiKeyRef` `oauth_<client>`) put the client ID there. Delegated OAuth keys are real gateway
 * keys: their requests record `authMethod: "oauth"` and the app's client ID, and still count
 * against the key's limits, rate limit policies and spend rules.
 */
export function keyIdIsOAuthClientId(apiKeyRef: string | null | undefined): boolean {
	return typeof apiKeyRef === "string" && apiKeyRef.startsWith("oauth_");
}
