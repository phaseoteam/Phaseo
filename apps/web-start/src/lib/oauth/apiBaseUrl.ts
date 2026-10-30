export function apiBaseUrl(): string {
	return (
		process.env.NEXT_PUBLIC_API_URL ??
		process.env.NEXT_PUBLIC_GATEWAY_API_URL?.replace(/\/v1\/?$/, "") ??
		"https://api.phaseo.app"
	).replace(/\/+$/, "");
}
