jest.mock("@supabase/ssr", () => ({
	createServerClient: jest.fn(),
}));

import { createServerClient } from "@supabase/ssr";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { publicLocales } from "@/i18n/routing";
import {
	config,
	isLocalizedAuthPath,
	isLocalizedPagePath,
	proxy,
} from "./proxy";

const origin = "https://phaseo.app";
const localizedAuthRoutes = ["sign-in", "sign-up", "error"] as const;
const mockCreateServerClient = jest.mocked(createServerClient);

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
		{ auth } as unknown as ReturnType<typeof createServerClient>,
	);
	return auth;
}

describe("public localisation proxy", () => {
	beforeEach(() => {
		mockCreateServerClient.mockReset();
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

	it.each(["/de-DE/apps", "/fr-FR/gateway/usage", "/ja/chat"])(
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
