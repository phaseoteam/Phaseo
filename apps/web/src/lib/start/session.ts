// Supabase session refresh for the request middleware. Same behaviour as
// src/utils/supabase/middleware.ts (Next): refresh auth cookies, keep the
// active-workspace cookie, forward the refreshed cookies to server rendering,
// send private web-API calls with a bearer token, gate /settings and MFA.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { canUpgradeCookieAuth } from "@/utils/supabase/cookieAuthRequest";
import { isPublicLocale } from "@/i18n/locales";

const ACTIVE_WORKSPACE_COOKIE_NAME = "activeWorkspaceId";
const ACTIVE_WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type CookieToSet = { name: string; value: string; options?: CookieOptions };
export type SessionResult = {
	/** Request headers the rest of this request should see (refreshed cookies, bearer token). */
	forwardedHeaders: Headers;
	/** Cookies and headers to add to the response. */
	cookies: CookieToSet[];
	responseHeaders: Headers;
	/** Set when the session decides the request must go elsewhere. */
	redirectTo?: URL;
};

function withoutLocalePrefix(pathname: string): string {
	const segments = pathname.split("/").filter(Boolean);
	if (isPublicLocale(segments[0] ?? "")) segments.shift();
	return `/${segments.join("/")}`;
}

function parseCookies(header: string | null): Map<string, string> {
	const map = new Map<string, string>();
	for (const part of (header ?? "").split(/;\s*/)) {
		const eq = part.indexOf("=");
		if (eq <= 0) continue;
		const raw = part.slice(eq + 1);
		let value = raw;
		try {
			value = decodeURIComponent(raw);
		} catch {
			// keep raw
		}
		map.set(part.slice(0, eq), value);
	}
	return map;
}

function serializeCookieHeader(cookies: Map<string, string>): string {
	return [...cookies].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
}

export async function refreshSession(request: Request): Promise<SessionResult> {
	const url = new URL(request.url);
	const forwardedHeaders = new Headers(request.headers);
	const responseHeaders = new Headers();
	const responseCookies = new Map<string, CookieToSet>();
	const requestCookies = parseCookies(request.headers.get("cookie"));
	const pathname = withoutLocalePrefix(url.pathname);

	const supabase = createServerClient(process.env.PUBLIC_SUPABASE_URL!, process.env.PUBLIC_SUPABASE_ANON_KEY!, {
		cookies: {
			getAll: () => [...requestCookies].map(([name, value]) => ({ name, value })),
			setAll: (cookiesToSet: CookieToSet[], headers: Record<string, string> = {}) => {
				for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
				for (const cookie of cookiesToSet) {
					requestCookies.set(cookie.name, cookie.value);
					responseCookies.set(cookie.name, cookie);
				}
			},
		},
	});

	const [{ data: { user } }, { data: { session }, error: sessionError }] = await Promise.all([
		supabase.auth.getUser(),
		supabase.auth.getSession(),
	]);

	if (!user && !session && !sessionError && requestCookies.has(ACTIVE_WORKSPACE_COOKIE_NAME)) {
		requestCookies.delete(ACTIVE_WORKSPACE_COOKIE_NAME);
		responseCookies.set(ACTIVE_WORKSPACE_COOKIE_NAME, { name: ACTIVE_WORKSPACE_COOKIE_NAME, value: "", options: { path: "/", maxAge: 0 } });
	}

	if (user && !requestCookies.has(ACTIVE_WORKSPACE_COOKIE_NAME)) {
		const { data: userRow, error } = await supabase.from("users").select("default_workspace_id").eq("user_id", user.id).maybeSingle();
		const defaultWorkspaceId = String(userRow?.default_workspace_id ?? "").trim();
		if (error) {
			console.warn("[workspace-cookie] failed to resolve default workspace", { userId: user.id, error: error.message });
		} else if (defaultWorkspaceId) {
			const workspaceCookie = {
				name: ACTIVE_WORKSPACE_COOKIE_NAME,
				value: defaultWorkspaceId,
				options: { httpOnly: true, path: "/", secure: true, sameSite: "lax" as const, maxAge: ACTIVE_WORKSPACE_COOKIE_MAX_AGE },
			};
			requestCookies.set(workspaceCookie.name, workspaceCookie.value);
			responseCookies.set(workspaceCookie.name, workspaceCookie);
		}
	}

	forwardedHeaders.set("cookie", serializeCookieHeader(requestCookies));

	const isPrivateWebApiRequest = pathname.startsWith("/api/account/") || pathname.startsWith("/api/chat/") || pathname.startsWith("/api/internal/");
	if (isPrivateWebApiRequest) {
		const activeWorkspaceId = requestCookies.get(ACTIVE_WORKSPACE_COOKIE_NAME);
		forwardedHeaders.delete("cookie");
		if (activeWorkspaceId) forwardedHeaders.set("cookie", `activeWorkspaceId=${encodeURIComponent(activeWorkspaceId)}`);
	}
	if (isPrivateWebApiRequest && session?.access_token && canUpgradeCookieAuth(request.headers, url.origin) && !forwardedHeaders.has("authorization")) {
		forwardedHeaders.set("authorization", `Bearer ${session.access_token}`);
	}

	const result: SessionResult = { forwardedHeaders, cookies: [...responseCookies.values()], responseHeaders };

	// Keep strict auth-gate behaviour for settings pages only.
	if (!user && pathname.startsWith("/settings")) {
		const target = new URL(url);
		target.pathname = "/sign-in";
		target.search = "";
		target.searchParams.set("returnUrl", url.pathname + url.search);
		result.redirectTo = target;
		return result;
	}

	if (user) {
		const [{ data: factorsData }, { data: aalData }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
		const hasVerifiedFactor = Object.values(factorsData ?? {}).some((factors) => Array.isArray(factors) && factors.some((factor) => factor.status === "verified"));
		const mustVerifyMfa = hasVerifiedFactor && aalData?.currentLevel === "aal1" && aalData?.nextLevel === "aal2";
		if (mustVerifyMfa && pathname !== "/auth/verify-mfa") {
			const target = new URL(url);
			target.pathname = "/auth/verify-mfa";
			target.search = "";
			target.searchParams.set("returnUrl", url.pathname + url.search);
			result.redirectTo = target;
		}
	}
	return result;
}
