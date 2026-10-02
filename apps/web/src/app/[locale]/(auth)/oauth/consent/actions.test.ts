jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));

import { createClient } from "@/utils/supabase/server";
import { approveAuthorizationAction } from "./actions";

describe("OAuth approval assurance", () => {
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
