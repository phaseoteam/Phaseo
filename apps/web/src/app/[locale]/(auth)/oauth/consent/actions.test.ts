jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));

import { createClient } from "@/utils/supabase/server";
import { approveAuthorizationAction, denyAuthorizationAction } from "./actions";

describe("OAuth approval assurance", () => {
	it("returns a desktop denial to its registered temporary loopback port", async () => {
		jest.mocked(createClient).mockResolvedValue({ auth: {
			getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
			getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "owned-fixture-session" } } }),
		} } as never);
		const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ client_id: "phaseo_desktop", redirect_uris: ["http://127.0.0.1/callback"], is_first_party: true, registration_source: "first_party" })));
		try {
			const result = await denyAuthorizationAction({ client_id: "phaseo_desktop", redirect_uri: "http://127.0.0.1:30397/callback", state: "owned-state" });
			const url = new URL(result.data!.redirect_url!);
			expect(url.origin).toBe("http://127.0.0.1:30397");
			expect(url.searchParams.get("error")).toBe("access_denied");
			expect(url.searchParams.get("state")).toBe("owned-state");
			expect(await denyAuthorizationAction({ client_id: "phaseo_desktop", redirect_uri: "https://example.com/callback" })).toEqual({ error: "OAuth client or redirect URI is invalid" });
		} finally { fetchMock.mockRestore(); }
	});
	it.each([
		{ currentLevel: "aal1", nextLevel: "aal2" },
		null,
	])("rejects approval before accessing authorization data when assurance is insufficient: %j", async (data) => {
		const getAuthorizationDetails = jest.fn();
		jest.mocked(createClient).mockResolvedValue({ auth: {
			getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
			mfa: { getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({ data, error: null }) },
			oauth: { getAuthorizationDetails },
		} } as never);
		expect(await approveAuthorizationAction({ authorization_id: "auth-1", workspace_id: "workspace-1" })).toEqual({ error: "Unauthorized" });
		expect(getAuthorizationDetails).not.toHaveBeenCalled();
	});

	it.each(["aal1", "aal2"])("retains the existing approved-authorization flow at required level %s", async (level) => {
		const getAuthorizationDetails = jest.fn().mockResolvedValue({ data: { redirect_url: "https://client.example/callback" } });
		jest.mocked(createClient).mockResolvedValue({ auth: {
			getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
			mfa: { getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({ data: { currentLevel: level, nextLevel: level }, error: null }) },
			oauth: { getAuthorizationDetails },
		} } as never);
		expect(await approveAuthorizationAction({ authorization_id: "auth-1", workspace_id: "workspace-1" })).toEqual({ data: { redirect_url: "https://client.example/callback", authorization_id: "auth-1" } });
	});

	it.each([
		[20_000_000_000, { monthly_limit_cost_nanos: 20_000_000_000 }],
		[0, { monthly_limit_cost_nanos: 0 }],
		[undefined, {}],
	])("passes the consent screen's monthly spending limit (%s) to the gateway", async (limit, expected) => {
		jest.mocked(createClient).mockResolvedValue({
			auth: {
				getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
				getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: "owned-fixture-session" } } }),
				mfa: { getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
				oauth: {},
			},
			from: () => ({ select: () => ({ eq: () => ({ in: jest.fn().mockResolvedValue({ data: [{ workspace_id: "workspace-1" }], error: null }) }) }) }),
		} as never);
		const fetchMock = jest.spyOn(global, "fetch")
			.mockResolvedValueOnce(new Response(JSON.stringify({ client_id: "partner-app", redirect_uris: ["https://client.example/callback"], is_first_party: false })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ redirect_url: "https://client.example/callback?code=1" })));
		try {
			const result = await approveAuthorizationAction({
				client_id: "partner-app", workspace_id: "workspace-1", scopes: ["gateway:access"], redirect_uri: "https://client.example/callback",
				code_challenge: "challenge", code_challenge_method: "S256", monthly_limit_cost_nanos: limit,
			});
			expect(result).toEqual({ data: { redirect_url: "https://client.example/callback?code=1" } });
			const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
			expect(url).toMatch(/\/oauth\/authorize\/approve$/);
			const body = JSON.parse(String(init.body));
			expect(body).toMatchObject(expected);
			if (limit === undefined) expect(body).not.toHaveProperty("monthly_limit_cost_nanos");
		} finally { fetchMock.mockRestore(); }
	});
});
