export function apiBaseUrl(): string {
	return (
		process.env.PUBLIC_API_URL ??
		process.env.PUBLIC_GATEWAY_API_URL?.replace(/\/v1\/?$/, "") ??
		"https://api.phaseo.app"
	).replace(/\/+$/, "");
}
