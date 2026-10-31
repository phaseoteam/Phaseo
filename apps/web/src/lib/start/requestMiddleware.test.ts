import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("@supabase/ssr", () => ({
	createServerClient: vi.fn(),
}));

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { publicLocales } from "@/i18n/locales";
import { requestOverride } from "@/lib/start/request-override";
import { phaseoRequestMiddleware } from "./requestMiddleware";

const origin = "https://phaseo.app";
const mockCreateServerClient = vi.mocked(createServerClient);
const WRITE_HANDLER = /\b(?:POST|PUT|PATCH|DELETE)\s*:/;

type ServerMiddleware = (options: { request: Request; next: () => Promise<{ response: Response }> }) => Promise<Response>;
const runMiddleware = (phaseoRequestMiddleware as unknown as { options: { server: ServerMiddleware } }).options.server;

let page: ReturnType<typeof vi.fn<(request: Request | undefined) => Response>>;
let upstream: ReturnType<typeof vi.spyOn<typeof globalThis, "fetch">>;

/** Runs a request through the middleware; `page` stands in for the route. */
function send(pathname: string, init: RequestInit = {}): Promise<Response> {
	const request = new Request(new URL(pathname, origin), init);
	return runMiddleware({ request, next: async () => ({ response: page(requestOverride.getStore()) }) });
}

/** URL paths of server routes that accept writes, with dynamic segments filled in. */
function writeRoutePaths(routesDir: string): string[] {
	const files: string[] = [];
	const visit = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) visit(fullPath);
			else if (/\.tsx?$/.test(entry.name) && !entry.name.startsWith("-")) files.push(fullPath);
		}
	};
	visit(routesDir);
	return files.flatMap((file) => {
		const source = readFileSync(file, "utf8");
		const id = source.match(/createFileRoute\("([^"]+)"\)/)?.[1];
		if (!id || !WRITE_HANDLER.test(source)) return [];
		const segments = id.split("/").filter((segment) => segment && !segment.startsWith("_") && segment !== "{-$locale}")
			.map((segment) => (segment.startsWith("$") ? "sample" : segment));
		return [`/${segments.join("/")}`];
	});
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
		getUser: vi.fn().mockResolvedValue({ data: { user } }),
		getSession: vi.fn().mockResolvedValue({ data: { session } }),
		mfa: {
			listFactors: vi.fn().mockResolvedValue({
				data: { all: hasVerifiedFactor ? [{ status: "verified" }] : [] },
			}),
			getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
				data: { currentLevel, nextLevel },
			}),
		},
	};

	mockCreateServerClient.mockReturnValue(
		{
			auth,
			from: vi.fn(() => ({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
				})),
			})),
		} as unknown as ReturnType<typeof createServerClient>,
	);
	return auth;
}

function location(response: Response): URL {
	return new URL(response.headers.get("location")!, origin);
}

describe("request middleware", () => {
	beforeEach(() => {
		mockCreateServerClient.mockReset();
		page = vi.fn(() => new Response("page", { status: 200 }));
		upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("upstream", { status: 200 }));
	});
	afterEach(() => {
		upstream.mockRestore();
	});

	it.each([
		["/docs", "https://aistats.mintlify.site/docs"],
		["/docs/v1/quickstart", "https://aistats.mintlify.site/docs/v1/quickstart"],
		["/docs/zh-Hans/v1/api-reference/introduction", "https://aistats.mintlify.site/docs/zh-Hans/v1/api-reference/introduction"],
		["/ingest/flags", "https://eu.i.posthog.com/flags"],
		["/ingest/i/v0/e/", "https://eu.i.posthog.com/i/v0/e/"],
	])("proxies %s without a session refresh", async (pathname, target) => {
		await send(pathname);
		expect(upstream).toHaveBeenCalledWith(target, expect.anything());
		expect(page).not.toHaveBeenCalled();
		expect(mockCreateServerClient).not.toHaveBeenCalled();
	});

	it.each([
		"/docs-example",
		"/ingestion",
		"/models/openai/gpt-5.2",
		"/es-ES/models/openai/gpt-5.2",
		"/auth/callback",
		"/settings/keys/docs",
	])("lets %s reach its route", async (pathname) => {
		configureSupabase({ user: { id: "user-1" } });
		const response = await send(pathname);
		expect(response.status).toBe(200);
		expect(page).toHaveBeenCalledTimes(1);
		expect(upstream).not.toHaveBeenCalled();
	});

	it.each([
		"/settings/keys/example.json",
		"/settings/keys/key.png",
		"/settings/keys/OAuth%3A%20https%3A%2F%2Fchatgpt.com%2Foauth%2Fclient.json?workspaceId=6108396e-0e12-425d-91ff-a02d39a346e0&prefix=38eUe1",
	])("routes asset-like key names as pages: %s", async (pathname) => {
		configureSupabase({ user: { id: "user-1" }, session: { access_token: "session-token" } });
		const response = await send(pathname);
		expect(response.status).toBe(200);
		expect(page).toHaveBeenCalledTimes(1);
		// Only pages get locale alternates.
		expect(response.headers.get("link")).toContain('hreflang="x-default"');
		for (const locale of publicLocales.filter((locale) => locale !== "en-GB")) {
			page.mockClear();
			await send(`/${locale}${pathname}`);
			expect(page).toHaveBeenCalledTimes(1);
		}
	});

	it("runs locale routing for dotted model identifiers", async () => {
		const response = await send("/models/openai/gpt-4.1");
		expect(page).toHaveBeenCalledTimes(1);
		expect(response.headers.get("link")).toContain("/de-DE/models/openai/gpt-4.1");
	});

	it.each([
		["/models/openai/gpt-5/ja", "/models/openai/gpt-5"],
		["/models/vercel/v0-1.0-md/performance", "/models/vercel/v0-1.0-md"],
		["/en-US/models/z-ai/glm-5/playground", "/models/z-ai/glm-5"],
		["/de-DE/models/openai/gpt-4.1/benchmarks/extra", "/de-DE/models/openai/gpt-4.1"],
		["/en-GB/models/openai/gpt-5/fr-FR", "/models/openai/gpt-5"],
	])("redirects legacy model sub-path %s before rendering", async (pathname, expected) => {
		const response = await send(`${pathname}?view=table`);

		expect(response.status).toBe(308);
		expect(location(response).pathname).toBe(expected);
		expect(location(response).search).toBe("?view=table");
		expect(mockCreateServerClient).not.toHaveBeenCalled();
	});

	it.each([
		"/models",
		"/models/openai",
		"/models/openai/gpt-5",
		"/de-DE/models/openai/gpt-5",
		"/xx/models/openai/gpt-5/ja",
		"/benchmarks/openai/gpt-5/ja",
	])("leaves %s to the normal page routing", async (pathname) => {
		const response = await send(pathname);
		expect(response.status).toBe(200);
		expect(page).toHaveBeenCalledTimes(1);
	});

	it.each([
		["/en-US", "/"],
		["/en-US/", "/"],
		["/en-US/models/openai/gpt-5", "/models/openai/gpt-5"],
		["/en-us/compare", "/compare"],
		["/EN-US/benchmarks/gpqa", "/benchmarks/gpqa"],
		["/en-US/settings/keys", "/settings/keys"],
	])("sends retired English (US) URL %s to the English page", async (pathname, expected) => {
		const response = await send(`${pathname}?ref=old`);

		expect(response.status).toBe(308);
		expect(location(response).pathname).toBe(expected);
		expect(location(response).search).toBe("?ref=old");
		expect(mockCreateServerClient).not.toHaveBeenCalled();
	});

	it.each(["/en-GB/models", "/en-USA/models", "/models/en-US", "/fr-FR/models"])(
		"keeps %s out of the retired-locale redirect",
		async (pathname) => {
			expect((await send(pathname)).status).not.toBe(308);
		},
	);

	it.each([
		["an English browser", { "accept-language": "en-US,en;q=0.9" }],
		["a visitor who chose English (US) before", { "accept-language": "en-US", cookie: "PHASEO_LOCALE=en-US" }],
	])("serves %s the unprefixed English pages", async (_visitor, headers) => {
		const response = await send("/models", { headers });

		expect(response.headers.get("location")).toBeNull();
		expect(page).toHaveBeenCalledTimes(1);
	});

	it.each([
		["POST", "/models/openai/gpt-5", {}],
		["POST", "/ja/models/openai/gpt-5", { "content-type": "application/x-www-form-urlencoded" }],
		["POST", "/en-US/compare", { "content-type": "text/plain;charset=UTF-8" }],
		["POST", "/ja/chat", { "content-type": "application/json" }],
		["POST", "/models/openai/gpt-5/benchmarks", {}],
		["POST", "/models/openai/gpt-5", { "content-type": "multipart/form-data; boundary=----phaseo" }],
		["PUT", "/models", {}],
		["DELETE", "/de-DE/models", {}],
	] as Array<[string, string, Record<string, string>]>)("rejects %s %s before rendering", async (method, pathname, headers) => {
		const response = await send(pathname, { method, headers });

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET, HEAD");
		expect(page).not.toHaveBeenCalled();
		expect(mockCreateServerClient).not.toHaveBeenCalled();
	});

	it("lets server function calls reach the Start handler", async () => {
		const response = await send("/_server/example", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
		expect(response.status).toBe(200);
		expect(page).toHaveBeenCalledTimes(1);
	});

	it.each(["/oauth/consent/submit", "/api/chat/completions"])(
		"leaves POSTs to the %s route handler alone",
		async (pathname) => {
			configureSupabase({ session: { access_token: "session-token" } });
			const response = await send(pathname, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded", origin },
				body: "decision=approve",
			});

			expect(response.status).not.toBe(405);
		},
	);

	it("never rejects writes meant for a server route", async () => {
		configureSupabase({ session: { access_token: "session-token" } });
		const pathnames = writeRoutePaths(path.join(process.cwd(), "src/routes"));

		expect(pathnames).toContain("/oauth/consent/submit");
		for (const pathname of pathnames) {
			const response = await send(pathname, { method: "POST", headers: { origin }, body: "{}" });
			expect([pathname, response.status]).not.toEqual([pathname, 405]);
		}
	});

	it.each([
		"/api/account/me",
		"/api/internal/audit",
		"/api/chat/completions",
	])("forwards private API request %s with the session", async (pathname) => {
		const auth = configureSupabase({ session: { access_token: "session-token" } });

		await send(pathname, {
			headers: {
				cookie: "sb-access-token=cookie-token; activeWorkspaceId=workspace/team",
				origin,
				"sec-fetch-site": "same-origin",
			},
		});

		expect(auth.getSession).toHaveBeenCalledTimes(1);
		const [, init] = upstream.mock.calls[0];
		const headers = new Headers(init?.headers);
		expect(headers.get("authorization")).toBe("Bearer session-token");
		expect(headers.get("cookie")).toBe("activeWorkspaceId=workspace%2Fteam");
	});

	it.each(["/de-DE/apps", "/fr-FR/gateway/usage", "/ja/chat", "/oauth/consent", ...publicLocales.filter((locale) => locale !== "en-GB").map((locale) => `/${locale}/oauth/consent`)])(
		"preserves MFA redirects on %s",
		async (pathname) => {
			configureSupabase({
				user: { id: "user-1" },
				hasVerifiedFactor: true,
				currentLevel: "aal1",
				nextLevel: "aal2",
			});

			const response = await send(pathname);

			expect(response.status).toBe(307);
			expect(location(response).pathname).toBe("/auth/verify-mfa");
			expect(location(response).searchParams.get("returnUrl")).toBe(pathname);
		},
	);

	it("forwards refreshed session and workspace cookies to the page", async () => {
		const auth = configureSupabase({ user: { id: "user-1" }, session: { access_token: "refreshed-token" } });
		mockCreateServerClient.mockImplementationOnce((_url, _key, options) => {
			options.cookies.setAll?.([
				{ name: "sb-session", value: "refreshed", options: {} },
				{ name: "activeWorkspaceId", value: "workspace-new", options: {} },
			], { "Cache-Control": "private, no-store", "Pragma": "no-cache" });
			return { auth } as unknown as ReturnType<typeof createServerClient>;
		});
		const response = await send("/settings", {
			headers: { cookie: "sb-session=expired; activeWorkspaceId=workspace-old" },
		});
		const forwarded = page.mock.calls[0][0];
		expect(forwarded?.headers.get("cookie")).toContain("sb-session=refreshed");
		expect(forwarded?.headers.get("cookie")).toContain("activeWorkspaceId=workspace-new");
		expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("sb-session=refreshed"))).toBe(true);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("pragma")).toBe("no-cache");
	});

	it("blocks retired blog posts under a locale prefix", async () => {
		const response = await send("/de-DE/blog/security-notice-key-rotation-vercel-2026-04-19");

		expect(response.status).toBe(404);
		expect(mockCreateServerClient).not.toHaveBeenCalled();
	});

	it("negotiates the complete page tree, not only auth routes", async () => {
		expect((await send("/models")).status).toBe(200);
		expect((await send("/de-DE/models")).status).toBe(200);
		expect(page).toHaveBeenCalledTimes(2);
	});

	it("serves unprefixed auth routes in the default locale", async () => {
		const response = await send("/sign-in");
		expect(response.status).toBe(200);
		expect(page).toHaveBeenCalledTimes(1);
	});

	it("negotiates the first unprefixed auth visit from Accept-Language", async () => {
		const response = await send("/sign-in", {
			headers: { "accept-language": "de-DE,de;q=0.9,en;q=0.7" },
		});

		expect(response.status).toBe(307);
		expect(location(response).pathname).toBe("/de-DE/sign-in");
	});

	it("remembers an explicit locale for later unprefixed auth visits", async () => {
		const response = await send("/sign-up", {
			headers: { cookie: "PHASEO_LOCALE=ar-SA" },
		});

		expect(response.status).toBe(307);
		expect(location(response).pathname).toBe("/ar-SA/sign-up");
	});

	it("removes an explicit default-locale prefix", async () => {
		const response = await send("/en-GB/sign-up");

		expect(response.status).toBe(307);
		expect(location(response).pathname).toBe("/sign-up");
	});

	it("preserves a non-default public locale prefix", async () => {
		const response = await send("/de-DE/error");

		expect(response.status).toBe(200);
		expect(response.headers.get("location")).toBeNull();
		expect(page).toHaveBeenCalledTimes(1);
	});
});
