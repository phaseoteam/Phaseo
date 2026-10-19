jest.mock("@supabase/ssr", () => ({
	createServerClient: jest.fn(),
}));

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { publicLocales } from "@/i18n/routing";
import {
	config,
	getLegacyModelPageRedirect,
	getRetiredLocaleRedirect,
	isLocalizedAuthPath,
	isLocalizedPagePath,
	proxy,
} from "./proxy";

const origin = "https://phaseo.app";
const localizedAuthRoutes = ["sign-in", "sign-up", "error"] as const;
const mockCreateServerClient = jest.mocked(createServerClient);
const WRITE_HANDLER_EXPORT = /export (?:async )?(?:function|const) (?:POST|PUT|PATCH|DELETE)\b|\bas (?:POST|PUT|PATCH|DELETE)\b/;

/** URL paths of route handlers that accept writes, with dynamic segments filled in. */
function writeRouteHandlerPaths(appDir: string): string[] {
	const files: string[] = [];
	const visit = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) visit(fullPath);
			else if (/^route\.tsx?$/.test(entry.name)) files.push(fullPath);
		}
	};
	visit(appDir);
	return files
		.filter((file) => WRITE_HANDLER_EXPORT.test(readFileSync(file, "utf8")))
		.map((file) => path.relative(appDir, path.dirname(file)).split(path.sep)
			.filter((segment) => !/^\(.+\)$/.test(segment))
			.map((segment) => (segment.startsWith("[") ? "sample" : segment)))
		.map((segments) => `/${segments.join("/")}`);
}

function configureSupabase({
	user = null,
	session = null,
	hasVerifiedFactor = false,
	currentLevel = "aal2",
	nextLevel = "aal2",
}: {
	user?: { id: string } | null;
	session?: { access_token: string } | null;
	hasVerifiedFactor?: boolean;
	currentLevel?: string;
	nextLevel?: string;
} = {}) {
	const auth = {
		getUser: jest.fn().mockResolvedValue({ data: { user } }),
		getSession: jest.fn().mockResolvedValue({ data: { session } }),
		mfa: {
			listFactors: jest.fn().mockResolvedValue({
				data: { all: hasVerifiedFactor ? [{ status: "verified" }] : [] },
			}),
			getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
				data: { currentLevel, nextLevel },
			}),
		},
	};

	mockCreateServerClient.mockReturnValue(
		{
			auth,
			from: jest.fn(() => ({
				select: jest.fn(() => ({
					eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })),
				})),
			})),
		} as unknown as ReturnType<typeof createServerClient>,
	);
	return auth;
}

describe("public localisation proxy", () => {
	beforeEach(() => {
		mockCreateServerClient.mockReset();
	});

	it.each([
		"/docs",
		"/docs/",
		"/docs/v1/quickstart",
		"/docs/zh-Hans/v1/api-reference/introduction",
		"/ingest",
		"/ingest/flags",
		"/ingest/i/v0/e/",
	])("does not invoke session middleware for public external rewrite %s", (path) => {
		expect(unstable_doesMiddlewareMatch({ config, url: `${origin}${path}` })).toBe(false);
	});

	it.each([
		"/docs-example",
		"/ingestion",
		"/models/openai/gpt-5.2",
		"/es-ES/models/openai/gpt-5.2",
		"/auth/callback",
		"/oauth/consent/submit",
		"/settings/keys/docs",
	])("keeps page routing and authenticated handler middleware on %s", (path) => {
		expect(unstable_doesMiddlewareMatch({ config, url: `${origin}${path}` })).toBe(true);
	});

	it("matches every exact public auth route", () => {
		for (const route of localizedAuthRoutes) {
			expect(
				unstable_doesMiddlewareMatch({ config, url: `${origin}/${route}` }),
			).toBe(true);

			for (const locale of publicLocales) {
				const pathname = `/${locale}/${route}`;
				expect(isLocalizedAuthPath(pathname)).toBe(true);
				expect(
					unstable_doesMiddlewareMatch({
						config,
						url: `${origin}${pathname}`,
					}),
				).toBe(true);
			}
		}
	});

	it("keeps non-localized and invalid paths outside locale negotiation", () => {
		for (const pathname of [
			"/settings",
			"/internal/localisation-preview/de-DE",
			"/api/account/me",
			"/docs/getting-started",
			"/favicon.ico",
			"/en-XA/sign-in",
			"/xx/sign-in",
			"/de-DE/sign-in/enterprise",
		]) {
			expect(isLocalizedAuthPath(pathname)).toBe(false);
		}
		expect(isLocalizedPagePath("/models")).toBe(true);
		expect(isLocalizedPagePath("/de-DE/models")).toBe(true);
		expect(isLocalizedPagePath("/models/openai/gpt-4.1")).toBe(true);
		expect(isLocalizedPagePath("/api/account/me")).toBe(false);
		expect(isLocalizedPagePath("/.well-known/api-catalog")).toBe(false);
		expect(isLocalizedPagePath("/wordmark.svg")).toBe(false);
		expect(
			unstable_doesMiddlewareMatch({
				config,
				url: `${origin}/wordmark.svg`,
			}),
		).toBe(false);
		expect(isLocalizedPagePath("/auth/callback")).toBe(false);
		expect(isLocalizedPagePath("/docs/getting-started")).toBe(false);
	});

	it.each([
		"/settings/keys/example.json",
		"/settings/keys/key.png",
		"/settings/keys/OAuth%3A%20https%3A%2F%2Fchatgpt.com%2Foauth%2Fclient.json?workspaceId=6108396e-0e12-425d-91ff-a02d39a346e0&prefix=38eUe1",
	])("routes asset-like key names as pages: %s", async (path) => {
		configureSupabase({ user: { id: "user-1" }, session: { access_token: "session-token" } });
		const url = new URL(path, origin);
		expect(isLocalizedPagePath(url.pathname)).toBe(true);
		expect(unstable_doesMiddlewareMatch({ config, url: url.href })).toBe(true);
		const response = await proxy(new NextRequest(url));
		const rewritten = new URL(response.headers.get("x-middleware-rewrite")!);
		expect(rewritten.pathname).toBe(`/en-GB${url.pathname}`);
		expect(rewritten.search).toBe(url.search);
		for (const locale of publicLocales) {
			const localized = `/${locale}${url.pathname}`;
			expect(isLocalizedPagePath(localized)).toBe(true);
			expect(unstable_doesMiddlewareMatch({ config, url: `${origin}${localized}` })).toBe(true);
		}
	});

	it("runs locale routing for dotted model identifiers", async () => {
		const pathname = "/models/openai/gpt-4.1";
		expect(
			unstable_doesMiddlewareMatch({ config, url: `${origin}${pathname}` }),
		).toBe(true);

		const response = await proxy(new NextRequest(`${origin}${pathname}`));
		expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe(
			"/en-GB/models/openai/gpt-4.1",
		);
	});

	it.each([
		["/models/openai/gpt-5/ja", "/models/openai/gpt-5"],
		["/models/vercel/v0-1.0-md/performance", "/models/vercel/v0-1.0-md"],
		["/en-US/models/z-ai/glm-5/playground", "/models/z-ai/glm-5"],
		["/de-DE/models/openai/gpt-4.1/benchmarks/extra", "/de-DE/models/openai/gpt-4.1"],
		["/en-GB/models/openai/gpt-5/fr-FR", "/models/openai/gpt-5"],
	])("redirects legacy model sub-path %s before rendering", async (pathname, expected) => {
		expect(unstable_doesMiddlewareMatch({ config, url: `${origin}${pathname}` })).toBe(true);

		const response = await proxy(new NextRequest(`${origin}${pathname}?view=table`));
		const location = new URL(response.headers.get("location")!);

		expect(response.status).toBe(308);
		expect(location.pathname).toBe(expected);
		expect(location.search).toBe("?view=table");
		expect(mockCreateServerClient).not.toHaveBeenCalled();
	});

	it.each([
		"/models",
		"/models/openai",
		"/models/openai/gpt-5",
		"/de-DE/models/openai/gpt-5",
		"/xx/models/openai/gpt-5/ja",
		"/benchmarks/openai/gpt-5/ja",
	])("leaves %s to the normal page routing", (pathname) => {
		expect(getLegacyModelPageRedirect(pathname)).toBeNull();
	});

	it.each([
		["/en-US", "/"],
		["/en-US/", "/"],
		["/en-US/models/openai/gpt-5", "/models/openai/gpt-5"],
		["/en-us/compare", "/compare"],
		["/EN-US/benchmarks/gpqa", "/benchmarks/gpqa"],
		["/en-US/settings/keys", "/settings/keys"],
	])("sends retired English (US) URL %s to the English page", async (pathname, expected) => {
		expect(unstable_doesMiddlewareMatch({ config, url: `${origin}${pathname}` })).toBe(true);

		const response = await proxy(new NextRequest(`${origin}${pathname}?ref=old`));
		const location = new URL(response.headers.get("location")!);

		expect(response.status).toBe(308);
		expect(location.pathname).toBe(expected);
		expect(location.search).toBe("?ref=old");
		expect(mockCreateServerClient).not.toHaveBeenCalled();
	});

	it.each(["/en-GB/models", "/en-USA/models", "/models/en-US", "/fr-FR/models"])(
		"keeps %s out of the retired-locale redirect",
		(pathname) => {
			expect(getRetiredLocaleRedirect(pathname)).toBeNull();
		},
	);

	it.each([
		["an English browser", { "accept-language": "en-US,en;q=0.9" }],
		["a visitor who chose English (US) before", { "accept-language": "en-US", cookie: "PHASEO_LOCALE=en-US" }],
	])("serves %s the unprefixed English pages", async (_visitor, headers) => {
		const response = await proxy(new NextRequest(`${origin}/models`, { headers }));

		expect(response.headers.get("location")).toBeNull();
		expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/en-GB/models");
	});

	const writesWithoutServerAction: Array<[string, string, Record<string, string>]> = [
		["POST", "/models/openai/gpt-5", {}],
		["POST", "/ja/models/openai/gpt-5", { "content-type": "application/x-www-form-urlencoded" }],
		["POST", "/en-US/compare", { "content-type": "text/plain;charset=UTF-8" }],
		["POST", "/ja/chat", { "content-type": "application/json" }],
		["POST", "/models/openai/gpt-5/benchmarks", {}],
		["PUT", "/models", {}],
		["DELETE", "/de-DE/models", { "next-action": "7f0a1b" }],
	];

	it.each(writesWithoutServerAction)("rejects %s %s without a server action before rendering", async (method, pathname, headers) => {
		const response = await proxy(new NextRequest(`${origin}${pathname}`, { method, headers }));

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET, HEAD");
		expect(response.headers.get("x-middleware-rewrite")).toBeNull();
		expect(mockCreateServerClient).not.toHaveBeenCalled();
	});

	const serverActionPosts: Array<[string, Record<string, string>]> = [
		["a Next-Action header", { "next-action": "7f0a1b", "content-type": "text/plain;charset=UTF-8" }],
		["a form submitted before hydration", { "content-type": "multipart/form-data; boundary=----phaseo" }],
	];

	it.each(serverActionPosts)("lets server action POSTs with %s reach the page", async (_label, headers) => {
		const response = await proxy(
			new NextRequest(`${origin}/models/openai/gpt-5`, { method: "POST", headers }),
		);

		expect(response.status).toBe(200);
		expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe(
			"/en-GB/models/openai/gpt-5",
		);
	});

	it.each(["/oauth/consent/submit", "/api/chat/completions"])(
		"leaves POSTs to the %s route handler alone",
		async (pathname) => {
			configureSupabase({ session: { access_token: "session-token" } });
			const response = await proxy(
				new NextRequest(`${origin}${pathname}`, {
					method: "POST",
					headers: { "content-type": "application/x-www-form-urlencoded", origin },
					body: "decision=approve",
				}),
			);

			expect(response.status).not.toBe(405);
		},
	);

	it("never rejects writes meant for a route handler", () => {
		const pathnames = writeRouteHandlerPaths(path.join(__dirname, "app"));

		expect(pathnames).toContain("/oauth/consent/submit");
		expect(pathnames.filter((pathname) => isLocalizedPagePath(pathname))).toEqual([]);
	});

	it.each([
		"/api/account/me",
		"/api/internal/audit",
		"/api/chat/completions",
	])("matches and forwards private API request %s", async (pathname) => {
		const auth = configureSupabase({ session: { access_token: "session-token" } });
		const request = new NextRequest(`${origin}${pathname}`, {
			headers: {
				cookie: "sb-access-token=cookie-token; activeWorkspaceId=workspace/team",
				origin,
				"sec-fetch-site": "same-origin",
			},
		});

		expect(unstable_doesMiddlewareMatch({ config, url: `${origin}${pathname}` })).toBe(
			true,
		);
		const response = await proxy(request);

		expect(auth.getSession).toHaveBeenCalledTimes(1);
		expect(response.headers.get("x-middleware-request-authorization")).toBe(
			"Bearer session-token",
		);
		expect(response.headers.get("x-middleware-request-cookie")).toBe(
			"activeWorkspaceId=workspace%2Fteam",
		);
	});

	it.each(["/de-DE/apps", "/fr-FR/gateway/usage", "/ja/chat", "/oauth/consent", ...publicLocales.map((locale) => `/${locale}/oauth/consent`)])(
		"preserves MFA redirects on %s",
		async (pathname) => {
			configureSupabase({
				user: { id: "user-1" },
				hasVerifiedFactor: true,
				currentLevel: "aal1",
				nextLevel: "aal2",
			});

			const response = await proxy(new NextRequest(`${origin}${pathname}`));
			const location = new URL(response.headers.get("location")!);

			expect(response.status).toBe(307);
			expect(location.pathname).toBe("/auth/verify-mfa");
			expect(location.searchParams.get("returnUrl")).toBe(pathname);
		},
	);

	it("forwards refreshed session and workspace cookies without losing the locale rewrite", async () => {
		const auth = configureSupabase({ user: { id: "user-1" }, session: { access_token: "refreshed-token" } });
		mockCreateServerClient.mockImplementationOnce((_url, _key, options) => {
			options.cookies.setAll?.([
				{ name: "sb-session", value: "refreshed", options: {} },
				{ name: "activeWorkspaceId", value: "workspace-new", options: {} },
			], { "Cache-Control": "private, no-store", "Pragma": "no-cache" });
			return { auth } as unknown as ReturnType<typeof createServerClient>;
		});
		const response = await proxy(new NextRequest(`${origin}/settings`, {
			headers: { cookie: "sb-session=expired; activeWorkspaceId=workspace-old" },
		}));
		expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/en-GB/settings");
		expect(response.headers.get("x-middleware-request-cookie")).toContain("sb-session=refreshed");
		expect(response.headers.get("x-middleware-request-cookie")).toContain("activeWorkspaceId=workspace-new");
		expect(response.headers.get("x-middleware-request-x-next-intl-locale")).toBe("en-GB");
		expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("pragma")).toBe("no-cache");
	});

	it("blocks retired blog posts under a locale prefix", async () => {
		const response = await proxy(
			new NextRequest(
				`${origin}/de-DE/blog/security-notice-key-rotation-vercel-2026-04-19`,
			),
		);

		expect(response.status).toBe(404);
		expect(mockCreateServerClient).not.toHaveBeenCalled();
	});

	it("negotiates the complete page tree, not only auth routes", async () => {
		const unprefixed = await proxy(new NextRequest(`${origin}/models`));
		expect(new URL(unprefixed.headers.get("x-middleware-rewrite")!).pathname).toBe(
			"/en-GB/models",
		);

		const localized = await proxy(new NextRequest(`${origin}/de-DE/models`));
		expect(localized.headers.get("x-middleware-next")).toBe("1");
	});

	it("rewrites unprefixed auth routes to the default locale internally", async () => {
		const response = await proxy(new NextRequest(`${origin}/sign-in`));
		const rewrite = response.headers.get("x-middleware-rewrite");

		expect(rewrite).not.toBeNull();
		expect(new URL(rewrite!).pathname).toBe("/en-GB/sign-in");
	});

	it("negotiates the first unprefixed auth visit from Accept-Language", async () => {
		const response = await proxy(
			new NextRequest(`${origin}/sign-in`, {
				headers: { "accept-language": "de-DE,de;q=0.9,en;q=0.7" },
			}),
		);

		expect(response.status).toBe(307);
		expect(new URL(response.headers.get("location")!).pathname).toBe(
			"/de-DE/sign-in",
		);
	});

	it("remembers an explicit locale for later unprefixed auth visits", async () => {
		const response = await proxy(
			new NextRequest(`${origin}/sign-up`, {
				headers: { cookie: "PHASEO_LOCALE=ar-SA" },
			}),
		);

		expect(response.status).toBe(307);
		expect(new URL(response.headers.get("location")!).pathname).toBe(
			"/ar-SA/sign-up",
		);
	});

	it("removes an explicit default-locale prefix", async () => {
		const response = await proxy(new NextRequest(`${origin}/en-GB/sign-up`));

		expect(response.status).toBe(307);
		expect(new URL(response.headers.get("location")!).pathname).toBe("/sign-up");
	});

	it("preserves a non-default public locale prefix", async () => {
		const response = await proxy(new NextRequest(`${origin}/de-DE/error`));

		expect(response.status).toBe(200);
		expect(response.headers.get("x-middleware-rewrite")).toBeNull();
		expect(response.headers.get("x-middleware-next")).toBe("1");
	});
});
