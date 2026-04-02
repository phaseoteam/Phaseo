import { headers } from "next/headers";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";

export function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

export function configuredAuthOriginsFromEnv(
	env: NodeJS.ProcessEnv = process.env,
): string[] {
	const candidates = [
		String(env.NEXT_PUBLIC_WEBSITE_URL ?? "").trim(),
		String(env.WEBSITE_URL ?? "").trim(),
	]
		.map((value) => stripTrailingSlash(value))
		.filter(Boolean);
	return [...new Set(candidates)];
}

export function resolveLocalDevAuthOrigin(input: {
	originHeader?: string | null;
	hostHeader?: string | null;
}): string {
	const originHeader = input.originHeader?.trim() ?? null;
	const host = input.hostHeader?.trim() ?? null;
	const hostOrigin = host ? `http://${host}` : null;

	if (
		originHeader &&
		/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(originHeader)
	) {
		return stripTrailingSlash(originHeader);
	}

	if (
		hostOrigin &&
		/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostOrigin)
	) {
		return stripTrailingSlash(hostOrigin);
	}

	return "http://localhost:3000";
}

export async function resolveAuthOrigin(
	env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
	const configuredOrigins = configuredAuthOriginsFromEnv(env);
	const isDev = env.NODE_ENV !== "production";

	if (!isDev) {
		if (configuredOrigins.length > 0) return configuredOrigins[0]!;
		throw new Error(
			"NEXT_PUBLIC_WEBSITE_URL (or WEBSITE_URL) must be set for auth redirects in production.",
		);
	}

	const headerStore = await headers();
	return resolveLocalDevAuthOrigin({
		originHeader: headerStore.get("origin"),
		hostHeader:
			headerStore.get("x-forwarded-host") ?? headerStore.get("host"),
	});
}

export function buildAuthCallbackUrl(
	authOrigin: string,
	returnUrl?: unknown,
): string {
	const callbackUrl = new URL("/auth/callback", stripTrailingSlash(authOrigin));
	const sanitizedReturnUrl = sanitizeReturnUrl(returnUrl, "/");
	if (sanitizedReturnUrl !== "/") {
		callbackUrl.searchParams.set("returnUrl", sanitizedReturnUrl);
	}
	return callbackUrl.toString();
}

export async function resolveAuthCallbackUrl(returnUrl?: unknown): Promise<string> {
	const authOrigin = await resolveAuthOrigin();
	return buildAuthCallbackUrl(authOrigin, returnUrl);
}
