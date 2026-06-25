function normalizeHttpOrigin(candidate: string | null | undefined): string | null {
	if (typeof candidate !== "string") return null;

	const trimmed = candidate.trim();
	if (!trimmed) return null;

	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		return parsed.origin;
	} catch {
		return null;
	}
}

export function resolveStripeCheckoutBaseUrl(args: {
	configuredBaseUrl?: string | null;
	originHeader?: string | null;
	refererHeader?: string | null;
	fallbackBaseUrl?: string;
}): string {
	const fallbackBaseUrl = args.fallbackBaseUrl ?? "http://localhost:3000";

	return (
		normalizeHttpOrigin(args.configuredBaseUrl) ??
		normalizeHttpOrigin(args.originHeader) ??
		normalizeHttpOrigin(args.refererHeader) ??
		normalizeHttpOrigin(fallbackBaseUrl) ??
		"http://localhost:3000"
	);
}

export function buildStripeCheckoutRedirectUrls(args: {
	configuredBaseUrl?: string | null;
	originHeader?: string | null;
	refererHeader?: string | null;
	kind?: string | null;
	paymentAttempt?: number | string | null;
}): {
	baseUrl: string;
	settingsCreditsUrl: string;
	successUrl: string;
	cancelUrl: string;
} {
	const baseUrl = resolveStripeCheckoutBaseUrl(args);
	const settingsCreditsUrl = new URL("/settings/credits", baseUrl);
	const successUrl = new URL(settingsCreditsUrl);
	const cancelUrl = new URL(settingsCreditsUrl);

	successUrl.searchParams.set("checkout", "success");
	if (typeof args.kind === "string" && args.kind.trim()) {
		successUrl.searchParams.set("kind", args.kind.trim());
	}
	if (args.paymentAttempt !== null && args.paymentAttempt !== undefined) {
		successUrl.searchParams.set("payment_attempt", String(args.paymentAttempt));
	}

	cancelUrl.searchParams.set("checkout", "cancelled");

	return {
		baseUrl,
		settingsCreditsUrl: settingsCreditsUrl.toString(),
		successUrl: successUrl.toString(),
		cancelUrl: cancelUrl.toString(),
	};
}
