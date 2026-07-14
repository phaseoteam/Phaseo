import { getBindings } from "@/runtime/env";

type OAuthRateLimitBucket = "strict" | "token";

async function digestKey(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function checkOAuthRateLimit(
	req: Request,
	bucket: OAuthRateLimitBucket,
	discriminator: string,
): Promise<boolean> {
	try {
		const bindings = getBindings();
		const limiter = bucket === "strict"
			? bindings.OAUTH_STRICT_RATE_LIMITER
			: bindings.OAUTH_TOKEN_RATE_LIMITER;
		if (!limiter) return true;
		const clientAddress = req.headers.get("cf-connecting-ip") ?? "unknown";
		const key = await digestKey(`${bucket}:${clientAddress}:${discriminator}`);
		return (await limiter.limit({ key })).success;
	} catch (error) {
		console.error("OAuth rate limiter unavailable", error);
		return true;
	}
}
