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

type PreviewRequestHeaders = {
	originHeader?: string | null;
	hostHeader?: string | null;
};

function resolvePreviewRequestOrigin(
	requestHeaders: PreviewRequestHeaders,
): string | null {
	const host = requestHeaders.hostHeader?.split(",")[0]?.trim();
	if (!host) return null;

	const originHeader = requestHeaders.originHeader?.trim();

	try {
		const requestUrl = new URL(`https://${host}`);
		if (
			requestUrl.username ||
			requestUrl.password ||
			requestUrl.pathname !== "/" ||
			requestUrl.search ||
			requestUrl.hash
		) {
			return null;
		}

		if (!originHeader) {
			// Server Actions are same-origin checked by Next.js. Preserve the
			// forwarded public hostname instead of switching to Vercel's
			// deployment-specific hostname.
			return requestUrl.origin;
		}

		const origin = new URL(originHeader);
		if (
			origin.protocol !== "https:" ||
			origin.username ||
			origin.password ||
			origin.pathname !== "/" ||
			origin.search ||
			origin.hash ||
			origin.host.toLowerCase() !== requestUrl.host.toLowerCase()
		) {
			return null;
		}
		return origin.origin;
	} catch {
		return null;
	}
}

export function resolveVercelPreviewAuthOrigin(
	env: NodeJS.ProcessEnv = process.env,
	requestHeaders?: PreviewRequestHeaders,
): string | null {
	if (env.VERCEL_ENV !== "preview") return null;

	if (requestHeaders) {
		const requestOrigin = resolvePreviewRequestOrigin(requestHeaders);
		if (requestOrigin) return requestOrigin;

		if (requestHeaders.originHeader?.trim() || requestHeaders.hostHeader?.trim()) {
			return null;
		}
	}

	const deploymentUrl = String(
		env.VERCEL_URL ?? env.NEXT_PUBLIC_VERCEL_URL ?? "",
	).trim();
	if (!deploymentUrl) return null;

	try {
		const url = new URL(
			deploymentUrl.startsWith("http")
				? deploymentUrl
				: `https://${deploymentUrl}`,
		);
		if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app")) {
			return null;
		}
		return stripTrailingSlash(url.origin);
	} catch {
		return null;
	}
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

	if (env.VERCEL_ENV === "preview") {
		const headerStore = await headers();
		const originHeader = headerStore.get("origin");
		const hostHeader =
			headerStore.get("x-forwarded-host") ?? headerStore.get("host");
		const previewOrigin = resolveVercelPreviewAuthOrigin(env, {
			originHeader,
			hostHeader,
		});

		if (previewOrigin) return previewOrigin;
		if (originHeader || hostHeader) {
			throw new Error(
				"Could not resolve a safe preview origin for the auth callback.",
			);
		}

		const deploymentOrigin = resolveVercelPreviewAuthOrigin(env);
		if (deploymentOrigin) return deploymentOrigin;
		throw new Error("A Vercel deployment URL is required for preview auth redirects.");
	}

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
