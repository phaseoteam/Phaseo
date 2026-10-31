// Global request middleware. In order: site redirects (siteRules.ts), proxied
// paths (web API, docs, analytics), then the page rules (write-method guard,
// markdown negotiation, legacy redirects, blog gates, locale negotiation and
// the Supabase session refresh) before the route runs. Site header rules are
// added to every response.
import { createMiddleware } from "@tanstack/react-start";
import { headerRules, redirects, type HostCondition } from "./siteRules";
import { readRequestCookie, serializeCookie } from "@/lib/http/cookies";
import { defaultLocale, isPublicLocale, publicLocales, type PublicLocale } from "@/i18n/locales";
import { localizePublicPath } from "@/lib/auth/localized-paths";
import { requestOverride } from "@/lib/start/request-override";

const LOCALE_COOKIE = "PHASEO_LOCALE";
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const WEB_API_PREFIXES = ["/api/_web/", "/api/account/", "/api/chat/", "/api/internal/"];
const SESSION_MIDDLEWARE_PAGE_ROOTS = ["/blog", "/settings", "/apps", "/gateway", "/onboarding", "/internal", "/chat", "/oauth/consent", "/activate"];
const STATIC_ASSET_PATH_SUFFIX = /\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|otf|pdf|png|svg|ttf|txt|wasm|webmanifest|webp|woff2?|xml|zip)$/i;
const RETIRED_BLOG_SLUGS = new Set(["security-notice-key-rotation-vercel-2026-04-19"]);
const RETIRED_LOCALE_PREFIXES = new Set(["en-us"]);
const PAGE_WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MINTLIFY_ORIGIN = "https://aistats.mintlify.site";

// --- Path patterns (":name", ":name*", ":name(a|b)?") -----------------------

function compilePattern(source: string): { regex: RegExp; names: string[] } {
	const names: string[] = [];
	let pattern = "";
	for (const segment of source.split("/").filter((s, i) => i > 0 || s)) {
		const m = segment.match(/^:([\w]+)(\([^)]*\))?([*+?])?$/);
		if (!m) {
			pattern += `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
			continue;
		}
		const [, name, group, modifier] = m;
		names.push(name);
		if (modifier === "*") pattern += `(?:/(.*))?`;
		else if (modifier === "+") pattern += `/(.+)`;
		else if (modifier === "?") pattern += `(?:/(${group ? group.slice(1, -1) : "[^/]+"}))?`;
		else pattern += `/(${group ? group.slice(1, -1) : "[^/]+"})`;
	}
	return { regex: new RegExp(`^${pattern || "/"}/?$`, "i"), names };
}

function matchRule(rule: { source: string; has?: HostCondition[] }, url: URL): Record<string, string> | null {
	for (const condition of rule.has ?? []) {
		if (condition.type === "host" && url.hostname !== condition.value.join(".")) return null;
	}
	const { regex, names } = compilePattern(rule.source);
	const m = url.pathname.match(regex);
	if (!m) return null;
	return Object.fromEntries(names.map((n, i) => [n, m[i + 1] ?? ""]));
}

function fillDestination(destination: string, params: Record<string, string>): string {
	return destination.replace(/:([\w]+)\*?/g, (_m, name: string) => params[name] ?? "").replace(/(?<!:)\/{2,}/g, "/").replace(/\/(?=[#?]|$)/, (s, offset, str) => (offset === 0 && str.length === 1 ? s : ""));
}

// --- Locale negotiation (default locale unprefixed, others prefixed) ----------

function matchAcceptLanguage(header: string | null): PublicLocale | null {
	if (!header) return null;
	const requested = header
		.split(",")
		.map((part) => {
			const [tag, ...params] = part.trim().split(";");
			const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
			return { tag: tag.trim(), q: q ? Number(q.slice(2)) : 1 };
		})
		.filter((entry) => entry.tag && entry.tag !== "*" && entry.q > 0)
		.sort((a, b) => b.q - a.q);
	for (const { tag } of requested) {
		const exact = publicLocales.find((l) => l.toLowerCase() === tag.toLowerCase());
		if (exact) return exact;
		const language = tag.split("-")[0].toLowerCase();
		const byLanguage = publicLocales.find((l) => l.split("-")[0].toLowerCase() === language);
		if (byLanguage) return byLanguage;
	}
	return null;
}

function withoutLocalePrefix(pathname: string): string {
	const segments = pathname.split("/").filter(Boolean);
	if (isPublicLocale(segments[0] ?? "")) segments.shift();
	return `/${segments.join("/")}`;
}

function alternateLinks(url: URL, barePath: string): string {
	const links = publicLocales.map((locale) => `<${url.origin}${localizePublicPath(locale, barePath)}>; rel="alternate"; hreflang="${locale}"`);
	links.push(`<${url.origin}${barePath}>; rel="alternate"; hreflang="x-default"`);
	return links.join(", ");
}

// --- Path classes ---------------------------------------------------------------

function isRouteHandlerPath(pathname: string): boolean {
	if (withoutLocalePrefix(pathname).startsWith("/settings/keys/")) return false;
	return (
		pathname === "/robots.txt" || pathname === "/indexnow-key.txt" || pathname.startsWith("/api/") || pathname.startsWith("/.well-known/") ||
		pathname.startsWith("/og/") || pathname.startsWith("/__markdown") || pathname === "/auth/callback" || pathname === "/oauth/consent/submit" ||
		pathname === "/status" || pathname === "/docs" || pathname.startsWith("/docs/") || pathname.startsWith("/ingest/") ||
		pathname.startsWith("/assets/") || pathname.startsWith("/_content/") || pathname.startsWith("/_server") ||
		STATIC_ASSET_PATH_SUFFIX.test(pathname)
	);
}

function needsSession(pathname: string): boolean {
	const pagePath = withoutLocalePrefix(pathname);
	if (WEB_API_PREFIXES.slice(1).some((prefix) => pathname.startsWith(prefix))) return true;
	return SESSION_MIDDLEWARE_PAGE_ROOTS.some((root) => pagePath === root || pagePath.startsWith(`${root}/`));
}

function getBlogSlugDate(pathname: string): Date | null {
	const slug = withoutLocalePrefix(pathname).replace(/^\/blog\//, "").split("/")[0];
	const match = slug.match(/-(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;
	const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function legacyModelPageRedirect(pathname: string): string | null {
	const segments = pathname.split("/").filter(Boolean);
	const first = segments[0] ?? "";
	const locale = isPublicLocale(first) ? first : null;
	const [section, organisationId, modelId, ...legacyPath] = locale ? segments.slice(1) : segments;
	if (section !== "models" || !modelId || legacyPath.length === 0) return null;
	return localizePublicPath(locale ?? defaultLocale, `/models/${organisationId}/${modelId}`);
}

function retiredLocaleRedirect(pathname: string): string | null {
	const [prefix = "", ...rest] = pathname.split("/").filter(Boolean);
	if (!RETIRED_LOCALE_PREFIXES.has(prefix.toLowerCase())) return null;
	return `/${rest.join("/")}`;
}

// --- Responses ----------------------------------------------------------------

function redirectResponse(location: string, status: number): Response {
	return new Response(null, { status, headers: { location } });
}

async function proxyTo(request: Request, target: string, init: { headers?: Headers } = {}): Promise<Response> {
	const headers = new Headers(init.headers ?? request.headers);
	headers.delete("host");
	const upstream = await fetch(target, {
		method: request.method,
		headers,
		body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
		redirect: "manual",
	});
	return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: new Headers(upstream.headers) });
}

function applyHeaderRules(response: Response, url: URL): Response {
	let headers: Headers | null = null;
	for (const rule of headerRules) {
		if (!matchRule(rule, url)) continue;
		headers ??= new Headers(response.headers);
		for (const { key, value } of rule.headers) headers.set(key, value);
	}
	if (!headers) return response;
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withCookies(response: Response, cookies: string[], extraHeaders?: Headers): Response {
	if (!cookies.length && !extraHeaders) return response;
	const headers = new Headers(response.headers);
	for (const cookie of cookies) headers.append("set-cookie", cookie);
	extraHeaders?.forEach((value, name) => headers.set(name, value));
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handle(request: Request, next: () => Promise<Response>): Promise<Response> {
	const url = new URL(request.url);
	const { pathname } = url;

	// 1. Site redirects.
	for (const rule of redirects) {
		const params = matchRule(rule, url);
		if (!params) continue;
		const destination = fillDestination(rule.destination, params);
		const location = /^https?:/.test(destination) ? destination : `${destination}${destination.includes("?") ? "" : url.search}`;
		return redirectResponse(location, rule.permanent ? 308 : 307);
	}

	// 2. External rewrites (on phaseo.app Cloudflare routes the web API first).
	if (WEB_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || pathname === "/api/_web") {
		const origin = (process.env.WEB_API_ORIGIN ?? "https://phaseo.app").replace(/\/+$/, "");
		if (pathname.startsWith("/api/_web")) return proxyTo(request, `${origin}${pathname}${url.search}`, { headers: (() => { const h = new Headers(request.headers); h.delete("cookie"); return h; })() });
		const { refreshSession } = await import("./session");
		const session = await refreshSession(request);
		const response = await proxyTo(request, `${origin}${pathname}${url.search}`, { headers: session.forwardedHeaders });
		return withCookies(response, session.cookies.map((c) => serializeCookie(c.name, c.value, c.options as never)));
	}
	if (pathname === "/docs" || pathname.startsWith("/docs/")) return proxyTo(request, `${MINTLIFY_ORIGIN}${pathname}${url.search}`);
	if (pathname.startsWith("/ingest/static/")) return proxyTo(request, `https://eu-assets.i.posthog.com/static/${pathname.slice("/ingest/static/".length)}${url.search}`);
	if (pathname.startsWith("/ingest/")) return proxyTo(request, `https://eu.i.posthog.com/${pathname.slice("/ingest/".length)}${url.search}`);

	const isPage = !isRouteHandlerPath(pathname);

	// 3. Page rules.
	if (isPage && PAGE_WRITE_METHODS.has(request.method)) {
		return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
	}
	if (pathname === "/" && request.method === "GET" && (request.headers.get("accept") ?? "").toLowerCase().includes("text/markdown")) {
		const { HOME_MARKDOWN_CACHE_CONTROL, homeMarkdownResponse } = await import("@/lib/http/homeMarkdown");
		const target = new URL(url);
		target.pathname = "/__markdown";
		target.searchParams.set("path", "/");
		return homeMarkdownResponse(new Request(target, request), HOME_MARKDOWN_CACHE_CONTROL);
	}
	const retired = retiredLocaleRedirect(pathname);
	const legacyModel = legacyModelPageRedirect(retired ?? pathname);
	if (retired !== null || legacyModel) return redirectResponse(`${legacyModel ?? retired}${url.search}`, 308);

	if (withoutLocalePrefix(pathname).startsWith("/blog/")) {
		const slug = withoutLocalePrefix(pathname).replace(/^\/blog\//, "").split("/")[0];
		if (RETIRED_BLOG_SLUGS.has(slug)) return new Response(null, { status: 404 });
		const publishedAt = getBlogSlugDate(pathname);
		if ((request.method === "GET" || request.method === "HEAD") && publishedAt && publishedAt.getTime() > Date.now()) {
			const { canPreviewFutureBlogPost } = await import("./blogPreviewGate");
			if (!(await canPreviewFutureBlogPost(request))) return new Response(null, { status: 404 });
		}
	}

	if (!isPage) {
		if (needsSession(pathname)) return runWithSession(request, next, []);
		return next();
	}

	// Locale negotiation for pages.
	const segments = pathname.split("/").filter(Boolean);
	const first = segments[0] ?? "";
	const exactPrefix = isPublicLocale(first) ? first : null;
	const caseMatch = exactPrefix ? null : publicLocales.find((l) => l.toLowerCase() === first.toLowerCase());
	if (caseMatch) {
		return redirectResponse(`/${[caseMatch, ...segments.slice(1)].join("/")}${url.search}`, 307);
	}
	const cookieLocale = readRequestCookie(request, LOCALE_COOKIE);
	let locale: PublicLocale;
	if (exactPrefix) {
		if (exactPrefix === defaultLocale) {
			const bare = `/${segments.slice(1).join("/")}`;
			return withCookies(redirectResponse(`${bare}${url.search}`, 307), [serializeCookie(LOCALE_COOKIE, defaultLocale, { maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" })]);
		}
		locale = exactPrefix;
	} else {
		const negotiated = (cookieLocale && isPublicLocale(cookieLocale) ? cookieLocale : null) ?? matchAcceptLanguage(request.headers.get("accept-language")) ?? defaultLocale;
		if (negotiated !== defaultLocale) {
			const target = localizePublicPath(negotiated, pathname === "/" ? "/" : pathname);
			return withCookies(redirectResponse(`${target}${url.search}`, 307), cookieLocale === negotiated ? [] : [serializeCookie(LOCALE_COOKIE, negotiated, { maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" })]);
		}
		locale = defaultLocale;
	}
	const cookies = cookieLocale === locale ? [] : [serializeCookie(LOCALE_COOKIE, locale, { maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" })];
	const linkHeader = new Headers({ link: alternateLinks(url, withoutLocalePrefix(pathname)) });

	if (needsSession(pathname)) return runWithSession(request, next, cookies, linkHeader);
	return withCookies(await next(), cookies, linkHeader);
}

async function runWithSession(request: Request, next: () => Promise<Response>, extraCookies: string[], extraHeaders?: Headers): Promise<Response> {
	const { refreshSession } = await import("./session");
	const session = await refreshSession(request);
	const sessionCookies = session.cookies.map((c) => serializeCookie(c.name, c.value, c.options as never));
	if (session.redirectTo) {
		const response = redirectResponse(session.redirectTo.toString(), 307);
		return withCookies(response, sessionCookies, session.responseHeaders);
	}
	const forwarded = new Request(request.url, { method: request.method, headers: session.forwardedHeaders, body: request.body, duplex: "half" } as RequestInit);
	const response = await requestOverride.run(forwarded, next);
	const headers = new Headers(extraHeaders);
	session.responseHeaders.forEach((value, name) => headers.set(name, value));
	return withCookies(response, [...extraCookies, ...sessionCookies], headers);
}

export const phaseoRequestMiddleware = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
	const url = new URL(request.url);
	const response = await handle(request, async () => {
		try {
			const result = await next();
			return (result as { response?: Response }).response ?? (result as unknown as Response);
		} catch (error) {
			// Unhandled failures in handlers and rendering; reported only with analytics consent.
			const { captureServerError } = await import("@/lib/analytics/serverErrorCapture");
			captureServerError(error, request, { source: "request" });
			throw error;
		}
	});
	return applyHeaderRules(response, url);
});
