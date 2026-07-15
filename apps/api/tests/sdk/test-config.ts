export function normalizeGatewayBaseUrl(value: string | undefined) {
	if (!value) return undefined;

	const normalized = value.replace(/\/+$/, "");
	return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}
