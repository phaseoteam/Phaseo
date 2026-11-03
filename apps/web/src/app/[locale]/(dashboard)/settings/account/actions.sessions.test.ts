jest.mock("@/utils/supabase/server", () => ({
	createClient: jest.fn(),
}));
jest.mock("@supabase/supabase-js", () => ({
	createClient: jest.fn(),
}));
jest.mock("@/utils/supabase/admin", () => ({
	createAdminClient: jest.fn(),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/lib/auth/accountLifecycleDiscord", () => ({
	sendAccountLifecycleDiscordWebhook: jest.fn(),
}));
jest.mock("@/lib/stripe", () => ({
	getStripe: jest.fn(),
}));

import {
	changeEmailAction,
	changePasswordAction,
	verifyMFAEnrollmentAction,
} from "./actions";
import { revokeOtherSessionsAfterPasswordResetAction } from "@/app/[locale]/(auth)/auth/reset-password/actions";
import { createClient } from "@/utils/supabase/server";
import { createClient as createSupabaseAuthClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const FACTOR_ID = "22222222-2222-4222-8222-222222222222";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockCreateSupabaseAuthClient = createSupabaseAuthClient as jest.MockedFunction<typeof createSupabaseAuthClient>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;

function sessionClient(options: { aal?: { currentLevel: string; nextLevel: string } } = {}) {
	return {
		auth: {
			getUser: jest.fn().mockResolvedValue({
				data: { user: { id: USER_ID, email: "user@example.com", app_metadata: { provider: "email" }, last_sign_in_at: "2026-11-03T12:00:00.000Z" } },
				error: null,
			}),
			getClaims: jest.fn().mockResolvedValue({ data: { claims: { amr: [] } }, error: null }),
			signInWithPassword: jest.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
			signOut: jest.fn().mockResolvedValue({ error: null }),
			updateUser: jest.fn().mockResolvedValue({ data: {}, error: null }),
			mfa: {
				getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
					data: options.aal ?? { currentLevel: "aal1", nextLevel: "aal1" },
					error: null,
				}),
				listFactors: jest.fn().mockResolvedValue({
					data: { totp: [{ id: FACTOR_ID, status: "unverified" }] },
					error: null,
				}),
				challenge: jest.fn().mockResolvedValue({ data: { id: "challenge_1" }, error: null }),
				verify: jest.fn().mockResolvedValue({ data: {}, error: null }),
				unenroll: jest.fn().mockResolvedValue({ error: null }),
			},
		},
	};
}

function passwordVerifier(ok = true) {
	const verifier = {
		auth: {
			signInWithPassword: jest.fn().mockResolvedValue(
				ok ? { data: { user: { id: USER_ID } }, error: null } : { data: { user: null }, error: { message: "Invalid login credentials" } },
			),
		},
	};
	mockCreateSupabaseAuthClient.mockReturnValue(verifier as never);
	return verifier;
}

function adminClient() {
	const updates: Array<{ table: string; values: unknown; filters: Array<[string, string, unknown]> }> = [];
	const admin = {
		from: jest.fn((table: string) => ({
			update: (values: unknown) => {
				const entry = { table, values, filters: [] as Array<[string, string, unknown]> };
				updates.push(entry);
				const builder = {
					eq: (column: string, value: unknown) => { entry.filters.push(["eq", column, value]); return builder; },
					is: (column: string, value: unknown) => { entry.filters.push(["is", column, value]); return Promise.resolve({ error: null }); },
				};
				return builder;
			},
			upsert: jest.fn().mockResolvedValue({ error: null }),
		})),
	};
	mockCreateAdminClient.mockReturnValue(admin as never);
	return updates;
}

function expectOtherSessionsRevoked(
	supabase: ReturnType<typeof sessionClient>,
	updates: ReturnType<typeof adminClient>,
) {
	expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
	for (const table of ["oauth_refresh_tokens", "oauth_authorizations"]) {
		const update = updates.find((entry) => entry.table === table);
		expect(update).toBeDefined();
		expect(update?.values).toEqual({ revoked_at: expect.any(String) });
		expect(update?.filters).toEqual([["eq", "user_id", USER_ID], ["is", "revoked_at", null]]);
	}
}

describe("account credential changes end other sessions", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
	});

	it("changing the password checks it without touching the session, then revokes other sessions and app grants", async () => {
		const supabase = sessionClient();
		mockCreateClient.mockResolvedValue(supabase as never);
		const verifier = passwordVerifier();
		const updates = adminClient();

		await expect(changePasswordAction("old-password", "New-password-1")).resolves.toEqual({ success: true });

		expect(verifier.auth.signInWithPassword).toHaveBeenCalledWith({ email: "user@example.com", password: "old-password" });
		expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
		expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "New-password-1" });
		expectOtherSessionsRevoked(supabase, updates);
	});

	it("changing the password needs MFA when the account has a second factor", async () => {
		const supabase = sessionClient({ aal: { currentLevel: "aal1", nextLevel: "aal2" } });
		mockCreateClient.mockResolvedValue(supabase as never);
		passwordVerifier();
		adminClient();

		await expect(changePasswordAction("old-password", "New-password-1")).rejects.toThrow(/MFA/);
		expect(supabase.auth.updateUser).not.toHaveBeenCalled();
	});

	it("changing the password refuses a wrong current password", async () => {
		const supabase = sessionClient();
		mockCreateClient.mockResolvedValue(supabase as never);
		passwordVerifier(false);
		adminClient();

		await expect(changePasswordAction("wrong", "New-password-1")).rejects.toThrow(/incorrect/);
		expect(supabase.auth.updateUser).not.toHaveBeenCalled();
	});

	it("changing the email needs MFA and checks the password without replacing the session", async () => {
		const blocked = sessionClient({ aal: { currentLevel: "aal1", nextLevel: "aal2" } });
		mockCreateClient.mockResolvedValue(blocked as never);
		passwordVerifier();
		adminClient();
		await expect(changeEmailAction("new@example.com", "old-password")).rejects.toThrow(/MFA/);
		expect(blocked.auth.updateUser).not.toHaveBeenCalled();

		const supabase = sessionClient({ aal: { currentLevel: "aal2", nextLevel: "aal2" } });
		mockCreateClient.mockResolvedValue(supabase as never);
		const verifier = passwordVerifier();
		await expect(changeEmailAction("new@example.com", "old-password")).resolves.toMatchObject({ success: true });
		expect(verifier.auth.signInWithPassword).toHaveBeenCalledTimes(1);
		expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
		expect(supabase.auth.updateUser).toHaveBeenCalledWith({ email: "new@example.com" });
	});

	it("turning on MFA revokes other sessions and app grants", async () => {
		const supabase = sessionClient();
		mockCreateClient.mockResolvedValue(supabase as never);
		passwordVerifier();
		const updates = adminClient();

		await expect(verifyMFAEnrollmentAction(FACTOR_ID, "123456", "old-password")).resolves.toEqual({ success: true });

		expect(supabase.auth.mfa.verify).toHaveBeenCalledTimes(1);
		expectOtherSessionsRevoked(supabase, updates);
	});

	it("a password reset revokes other sessions and app grants", async () => {
		const supabase = sessionClient();
		mockCreateClient.mockResolvedValue(supabase as never);
		const updates = adminClient();

		await expect(revokeOtherSessionsAfterPasswordResetAction()).resolves.toEqual({ success: true });

		expectOtherSessionsRevoked(supabase, updates);
	});
});
