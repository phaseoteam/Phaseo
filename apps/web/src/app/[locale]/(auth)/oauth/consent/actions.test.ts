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
});
