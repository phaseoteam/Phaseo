import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("@supabase/ssr", () => ({
	createServerClient: vi.fn(),
}));

import { createServerClient } from "@supabase/ssr";
import { refreshSession } from "./session";

const createServerClientMock = vi.mocked(createServerClient);

function createSupabaseClient(defaultWorkspaceId = "workspace-default", user: { id: string } | null = { id: "user-1" }) {
	const maybeSingle = vi.fn().mockResolvedValue({
		data: { default_workspace_id: defaultWorkspaceId },
		error: null,
	});
	const eq = vi.fn(() => ({ maybeSingle }));
	const select = vi.fn(() => ({ eq }));
	const from = vi.fn(() => ({ select }));

	return {
		auth: {
			getUser: vi.fn().mockResolvedValue({ data: { user } }),
			getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
			mfa: {
				listFactors: vi.fn().mockResolvedValue({ data: {} }),
				getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
					data: { currentLevel: "aal1", nextLevel: "aal1" },
				}),
			},
		},
		from,
	};
}

describe("workspace cookie session initialization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("sets and forwards the default workspace when the cookie is missing", async () => {
		const supabase = createSupabaseClient();
		createServerClientMock.mockReturnValue(supabase as never);

		const result = await refreshSession(new Request("http://localhost/models"));

		expect(supabase.from).toHaveBeenCalledWith("users");
		expect(result.cookies.find((cookie) => cookie.name === "activeWorkspaceId")?.value).toBe("workspace-default");
		expect(result.forwardedHeaders.get("cookie")).toContain("activeWorkspaceId=workspace-default");
	});

	it("keeps an existing workspace cookie without resolving the default", async () => {
		const supabase = createSupabaseClient();
		createServerClientMock.mockReturnValue(supabase as never);
		const request = new Request("http://localhost/models", {
			headers: { cookie: "activeWorkspaceId=workspace-selected" },
		});

		const result = await refreshSession(request);

		expect(supabase.from).not.toHaveBeenCalled();
		expect(result.cookies.find((cookie) => cookie.name === "activeWorkspaceId")).toBeUndefined();
		expect(result.forwardedHeaders.get("cookie")).toContain("activeWorkspaceId=workspace-selected");
	});

	it("allows the MFA challenge route when the user must verify MFA", async () => {
		const supabase = createSupabaseClient();
		supabase.auth.mfa.listFactors.mockResolvedValue({
			data: { totp: [{ status: "verified" }] },
		});
		supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
			data: { currentLevel: "aal1", nextLevel: "aal2" },
		});
		createServerClientMock.mockReturnValue(supabase as never);

		const challenge = await refreshSession(new Request("http://localhost/auth/verify-mfa"));
		expect(challenge.redirectTo).toBeUndefined();

		const other = await refreshSession(new Request("http://localhost/models?tab=1"));
		expect(other.redirectTo?.pathname).toBe("/auth/verify-mfa");
		expect(other.redirectTo?.searchParams.get("returnUrl")).toBe("/models?tab=1");
	});

	it("sends signed-out settings visits to sign-in with a return URL", async () => {
		createServerClientMock.mockReturnValue(createSupabaseClient("", null) as never);

		const result = await refreshSession(new Request("http://localhost/de-DE/settings/keys?page=2"));

		expect(result.redirectTo?.pathname).toBe("/sign-in");
		expect(result.redirectTo?.searchParams.get("returnUrl")).toBe("/de-DE/settings/keys?page=2");
	});
});
