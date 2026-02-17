export function resolveGatewayApiKeyFromEnv(env: NodeJS.ProcessEnv = process.env): string {
	const direct = normalize(env.GATEWAY_API_KEY);
	if (direct) return direct;

	const explicitGateway = normalize(env.PLAYGROUND_GATEWAY_KEY);
	if (explicitGateway) return explicitGateway;

	const playgroundSecret = normalize(env.PLAYGROUND_KEY);
	if (!playgroundSecret) return "";

	// Already a full gateway key or OAuth JWT.
	if (looksLikeGatewayAuthToken(playgroundSecret)) return playgroundSecret;

	const kid = normalize(env.PLAYGROUND_GATEWAY_KEY_KID);
	if (!kid) return playgroundSecret;
	return `aistats_v1_sk_${kid}_${playgroundSecret}`;
}

function normalize(value?: string): string {
	if (!value) return "";
	return value.trim().replace(/^['"]|['"]$/g, "");
}

function looksLikeGatewayAuthToken(token: string): boolean {
	if (!token) return false;
	if (token.startsWith("aistats_v1_sk_")) return true;
	return token.split(".").length === 3;
}
