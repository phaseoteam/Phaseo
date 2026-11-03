/**
 * Where Better Auth runs and which origins may send people back to it.
 *
 * - Production: `BETTER_AUTH_URL` (https://phaseo.app). The JWT issuer is pinned to it so tokens minted on any host
 *   verify the same way in the Workers.
 * - Vercel previews: the deployment URL and the branch URL are both served, so the base URL is resolved per request
 *   from an explicit allow-list of exactly those two hosts (never `*.vercel.app`, which anyone can deploy to).
 * - Local: http://localhost:3100 (apps/web `dev` script) and 127.0.0.1.
 * - Mobile (Expo): app.json `scheme: "phaseo"`; the perf build uses `phaseo-perf` (app.config.ts). The Expo Go
 *   `exp://` scheme is trusted outside production only.
 * - Desktop: has no custom URL scheme; it signs in through a one-time loopback listener
 *   (apps/desktop/src/main/phaseoLogin.ts, http://127.0.0.1:<port>/callback). Loopback is deliberately not a trusted
 *   origin: see MIGRATION-NOTES.md, "Desktop".
 */

type Env = Record<string, string | undefined>;

export const PRODUCTION_ORIGIN = "https://phaseo.app";
export const LOCAL_DEV_ORIGINS = ["http://localhost:3100", "http://127.0.0.1:3100"] as const;
export const MOBILE_SCHEMES = ["phaseo://", "phaseo-perf://"] as const;

function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function originOf(value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
		return stripTrailingSlash(url.origin);
	} catch {
		return null;
	}
}

function hostOf(value: string | undefined): string | null {
	const origin = originOf(value);
	return origin ? new URL(origin).host : null;
}

export function isProduction(env: Env): boolean {
	return env.NODE_ENV === "production";
}

/** The Vercel preview hosts this deployment answers on (deployment URL and branch URL), if it is a preview. */
export function vercelPreviewHosts(env: Env): string[] {
	if (env.VERCEL_ENV !== "preview") return [];
	const hosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.NEXT_PUBLIC_VERCEL_URL, env.NEXT_PUBLIC_VERCEL_BRANCH_URL]
		.map(hostOf)
		.filter((host): host is string => Boolean(host && host.endsWith(".vercel.app")));
	return [...new Set(hosts)];
}

/** The canonical origin: issuer of JWTs and the fallback base URL. */
export function canonicalOrigin(env: Env): string {
	return (
		originOf(env.BETTER_AUTH_URL) ??
		originOf(env.NEXT_PUBLIC_WEBSITE_URL) ??
		originOf(env.WEBSITE_URL) ??
		(isProduction(env) ? PRODUCTION_ORIGIN : LOCAL_DEV_ORIGINS[0])
	);
}

export type BaseURLSetting =
	| string
	| { allowedHosts: string[]; fallback: string; protocol: "https" | "http" | "auto" };

/** Better Auth's `baseURL`: static, except on previews where two hosts serve one deployment. */
export function resolveBaseURL(env: Env): BaseURLSetting {
	const previewHosts = vercelPreviewHosts(env);
	if (previewHosts.length > 0) {
		return { allowedHosts: previewHosts, fallback: `https://${previewHosts[0]}`, protocol: "https" };
	}
	return canonicalOrigin(env);
}

/** Better Auth's `trustedOrigins`: CSRF origin checks and callbackURL/redirectTo validation. */
export function resolveTrustedOrigins(env: Env): string[] {
	const origins = new Set<string>([canonicalOrigin(env)]);
	for (const value of [env.NEXT_PUBLIC_WEBSITE_URL, env.WEBSITE_URL]) {
		const origin = originOf(value);
		if (origin) origins.add(origin);
	}
	for (const host of vercelPreviewHosts(env)) origins.add(`https://${host}`);
	if (!isProduction(env)) {
		for (const origin of LOCAL_DEV_ORIGINS) origins.add(origin);
		origins.add("exp://");
	}
	for (const scheme of MOBILE_SCHEMES) origins.add(scheme);
	for (const extra of (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",")) {
		const trimmed = extra.trim();
		if (trimmed) origins.add(stripTrailingSlash(trimmed));
	}
	return [...origins];
}
