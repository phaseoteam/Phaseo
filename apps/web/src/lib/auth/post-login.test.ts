const createAdminClientMock = jest.fn();
const ensureWorkspaceStripeWalletMock = jest.fn();
const evaluateTeamSsoEnforcementNoopMock = jest.fn();
const classifyAuthMethodFromSessionMock = jest.fn((_: unknown) => "email");

jest.mock("@/utils/supabase/admin", () => ({
	createAdminClient: () => createAdminClientMock(),
}));

jest.mock("@/lib/server/activeTeamStripe", () => ({
	ensureWorkspaceStripeWallet: (arg: unknown) =>
		ensureWorkspaceStripeWalletMock(arg),
}));

jest.mock("@/lib/auth/ssoEnforcement", () => ({
	evaluateTeamSsoEnforcementNoop: (arg: unknown) =>
		evaluateTeamSsoEnforcementNoopMock(arg),
}));

jest.mock("@/lib/auth/method", () => ({
	classifyAuthMethodFromSession: (arg: unknown) =>
		classifyAuthMethodFromSessionMock(arg),
}));

import { finalizePostLogin } from "./post-login";

type FakeSupabaseUser = {
	auth: {
		getUser: jest.Mock;
		getSession: jest.Mock;
		mfa: {
			listFactors: jest.Mock;
			getAuthenticatorAssuranceLevel: jest.Mock;
		};
	};
};

function makeSupabaseUser(): FakeSupabaseUser {
	return {
		auth: {
			getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
			getSession: jest.fn().mockResolvedValue({ data: { session: { provider_token: null } } }),
			mfa: {
				listFactors: jest.fn().mockResolvedValue({ data: { totp: [] } }),
				getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
					data: { currentLevel: "aal1", nextLevel: "aal1" },
				}),
			},
		},
	};
}

function makeLegacyFallbackAdmin() {
	const usersSelectChain = {
		eq: jest.fn().mockReturnThis(),
		maybeSingle: jest.fn().mockResolvedValue({
			data: { default_workspace_id: null },
		}),
	};
	const usersUpdateChain = {
		eq: jest.fn().mockResolvedValue({ error: null }),
	};
	const workspacesSelectChain = {
		eq: jest.fn().mockReturnThis(),
		order: jest.fn().mockReturnThis(),
		limit: jest.fn().mockReturnThis(),
		maybeSingle: jest.fn().mockResolvedValue({
			data: { id: "ws_existing" },
		}),
	};

	return {
		rpc: jest.fn().mockResolvedValue({
			data: null,
			error: {
				message:
					'Could not find the function public.provision_personal_workspace(p_user_id, p_display_name) in the schema cache',
			},
		}),
		from: jest.fn((table: string) => {
			if (table === "users") {
				return {
					upsert: jest.fn().mockResolvedValue({ error: null }),
					select: jest.fn(() => usersSelectChain),
					update: jest.fn(() => usersUpdateChain),
				};
			}
			if (table === "workspaces") {
				return {
					select: jest.fn(() => workspacesSelectChain),
				};
			}
			if (table === "workspace_members" || table === "workspace_settings") {
				return {
					upsert: jest.fn().mockResolvedValue({ error: null }),
				};
			}
			throw new Error(`Unexpected table: ${table}`);
		}),
	};
}

describe("finalizePostLogin", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		ensureWorkspaceStripeWalletMock.mockResolvedValue({
			workspaceId: "ws_rpc",
			customerId: "cus_test",
			userId: "user_123",
		});
		evaluateTeamSsoEnforcementNoopMock.mockResolvedValue(undefined);
	});

	it("throws when no authenticated user is available", async () => {
		const supabaseUser = makeSupabaseUser();

		await expect(
			finalizePostLogin({
				supabaseUser: supabaseUser as never,
				returnUrl: "/settings/workspaces",
				source: "server_action",
			}),
		).rejects.toThrow("AUTHENTICATED_USER_MISSING");
	});

	it("provisions the personal workspace through the RPC and ensures a wallet row", async () => {
		const supabaseUser = makeSupabaseUser();
		createAdminClientMock.mockReturnValue({
			rpc: jest.fn().mockResolvedValue({
				data: { workspace_id: "ws_rpc", created_workspace: false },
				error: null,
			}),
		});

		const result = await finalizePostLogin({
			supabaseUser: supabaseUser as never,
			user: {
				id: "user_123",
				email: "rpc@example.com",
				created_at: "2026-04-23T10:00:00.000Z",
				user_metadata: { full_name: "RPC User" },
			} as never,
			session: { access_token: "token" } as never,
			returnUrl: "/settings/workspaces",
			source: "server_action",
		});

		expect(result).toEqual({
			redirectPath: "/settings/workspaces",
			workspaceId: "ws_rpc",
			userId: "user_123",
			createdPersonalTeam: false,
		});
		expect(ensureWorkspaceStripeWalletMock).toHaveBeenCalledWith({
			workspaceId: "ws_rpc",
			userId: "user_123",
			email: "rpc@example.com",
			name: "RPC User",
		});
		expect(evaluateTeamSsoEnforcementNoopMock).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceId: "ws_rpc",
				userId: "user_123",
				authMethod: "email",
			}),
		);
	});

	it("falls back to the legacy provisioning path when the RPC is missing from schema cache", async () => {
		const supabaseUser = makeSupabaseUser();
		createAdminClientMock.mockReturnValue(makeLegacyFallbackAdmin());

		const result = await finalizePostLogin({
			supabaseUser: supabaseUser as never,
			user: {
				id: "user_456",
				email: "fallback@example.com",
				created_at: "2026-04-23T10:00:00.000Z",
				user_metadata: { name: "Fallback User" },
			} as never,
			session: { access_token: "token" } as never,
			returnUrl: "/settings/workspaces",
			source: "server_action",
		});

		expect(result).toEqual({
			redirectPath: "/settings/workspaces",
			workspaceId: "ws_existing",
			userId: "user_456",
			createdPersonalTeam: false,
		});
		expect(ensureWorkspaceStripeWalletMock).toHaveBeenCalledWith({
			workspaceId: "ws_existing",
			userId: "user_456",
			email: "fallback@example.com",
			name: "Fallback User",
		});
	});
});
