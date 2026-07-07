export function canonicalByokProviderId(providerId: string): string {
	const normalized = providerId.trim().toLowerCase();
	if (normalized === "x-ai" || normalized === "xai") return "spacex-ai";
	return normalized;
}
