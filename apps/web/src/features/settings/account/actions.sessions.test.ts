import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/utils/supabase/server", () => ({
	createClient: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
	createClient: vi.fn(),
}));
vi.mock("@/utils/supabase/admin", () => ({
	createAdminClient: vi.fn(),
}));
vi.mock("@/lib/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/accountLifecycleDiscord", () => ({
	sendAccountLifecycleDiscordWebhook: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
	getStripe: vi.fn(),
}));

import {
	changeEmailAction,
	changePasswordAction,
	verifyMFAEnrollmentAction,
} from "./actions";
import { revokeOtherSessionsAfterPasswordResetAction } from "@/features/auth/reset-password/actions";
import { createClient } from "@/utils/supabase/server";
import { createClient as createSupabaseAuthClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const FACTOR_ID = "22222222-2222-4222-8222-222222222222";

const mockCreateClient = vi.mocked(createClient);
const mockCreateSupabaseAuthClient = vi.mocked(createSupabaseAuthClient);
const mockCreateAdminClient = vi.mocked(createAdminClient);

// The server function middleware logs the real error and sends the browser a generic one.
async function expectActionError(run: () => Promise<unknown>, message: string | RegExp) {
	const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
	try {
		await expect(run()).rejects.toThrow("Server action failed");
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("[server-action]"),
			expect.objectContaining({
				message: typeof message === "string" ? expect.stringContaining(message) : expect.stringMatching(message),
			}),
		);
	} finally {
		log.mockRestore();
	}
}

function sessionClient(options: { aal?: { currentLevel: string; nextLevel: string; currentAuthenticationMethods?: Array<{ method: string; timestamp: number }> } } = {}) {
	return {
		auth: {
			getUser: vi.fn().mockResolvedValue({
				data: { user: { id: USER_ID, email: "user@example.com", app_metadata: { provider: "email" }, last_sign_in_at: "2026-11-03T12:00:00.000Z" } },
				error: null,
			}),
			getClaims: vi.fn().mockResolvedValue({ data: { claims: { amr: [] } }, error: null }),
			signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
			signOut: vi.fn().mockResolvedValue({ error: null }),
			updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
			mfa: {
				getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
					data: options.aal ?? { currentLevel: "aal1", nextLevel: "aal1" },
					error: null,
				}),
				listFactors: vi.fn().mockResolvedValue({
					data: { totp: [{ id: FACTOR_ID, status: "unverified" }] },
					error: null,
				}),
				challenge: vi.fn().mockResolvedValue({ data: { id: "challenge_1" }, error: null }),
				verify: vi.fn().mockResolvedValue({ data: {}, error: null }),
				unenroll: vi.fn().mockResolvedValue({ error: null }),
			},
		},
	};
}

function passwordVerifier(ok = true) {
	const verifier = {
		auth: {
			signInWithPassword: vi.fn().mockResolvedValue(
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
		from: vi.fn((table: string) => ({
			update: (values: unknown) => {
				const entry = { table, values, filters: [] as Array<[string, string, unknown]> };
				updates.push(entry);
				const builder = {
					eq: (column: string, value: unknown) => { entry.filters.push(["eq", column, value]); return builder; },
					is: (column: string, value: unknown) => { entry.filters.push(["is", column, value]); return Promise.resolve({ error: null }); },
				};
				return builder;
			},
			upsert: vi.fn().mockResolvedValue({ error: null }),
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
		vi.clearAllMocks();
		process.env.PUBLIC_SUPABASE_URL = "https://example.supabase.co";
		process.env.PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
	});

	it("changing the password checks it without touching the session, then revokes other sessions and app grants", async () => {
		const supabase = sessionClient();
		mockCreateClient.mockResolvedValue(supabase as never);
		const verifier = passwordVerifier();
		const updates = adminClient();

		await expect(changePasswordAction({ data: { currentPassword: "old-password", newPassword: "New-password-1" } })).resolves.toEqual({ success: true });

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

		await expectActionError(() => changePasswordAction({ data: { currentPassword: "old-password", newPassword: "New-password-1" } }), /MFA/);
		expect(supabase.auth.updateUser).not.toHaveBeenCalled();
	});

	it("changing the password refuses a wrong current password", async () => {
		const supabase = sessionClient();
		mockCreateClient.mockResolvedValue(supabase as never);
		passwordVerifier(false);
		adminClient();

		await expectActionError(() => changePasswordAction({ data: { currentPassword: "wrong", newPassword: "New-password-1" } }), /incorrect/);
		expect(supabase.auth.updateUser).not.toHaveBeenCalled();
	});

	it("changing the email needs MFA and checks the password without replacing the session", async () => {
		const blocked = sessionClient({ aal: { currentLevel: "aal1", nextLevel: "aal2" } });
		mockCreateClient.mockResolvedValue(blocked as never);
		passwordVerifier();
		adminClient();
		await expectActionError(() => changeEmailAction({ data: { newEmail: "new@example.com", currentPassword: "old-password" } }), /MFA/);
		expect(blocked.auth.updateUser).not.toHaveBeenCalled();

		const supabase = sessionClient({ aal: { currentLevel: "aal2", nextLevel: "aal2" } });
		mockCreateClient.mockResolvedValue(supabase as never);
		const verifier = passwordVerifier();
		await expect(changeEmailAction({ data: { newEmail: "new@example.com", currentPassword: "old-password" } })).resolves.toMatchObject({ success: true });
		expect(verifier.auth.signInWithPassword).toHaveBeenCalledTimes(1);
		expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
		expect(supabase.auth.updateUser).toHaveBeenCalledWith({ email: "new@example.com" });
	});

	it("turning on MFA revokes other sessions and app grants", async () => {
		const supabase = sessionClient();
		mockCreateClient.mockResolvedValue(supabase as never);
		passwordVerifier();
		const updates = adminClient();

		await expect(verifyMFAEnrollmentAction({ data: { factorId: FACTOR_ID, code: "123456", currentPassword: "old-password" } })).resolves.toEqual({ success: true });

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

	it("an MFA account's password-only session can't trigger the reset revocation", async () => {
		// The cookie's copy of the factors was removed, so the SDK reports nextLevel aal1; the server still has a verified factor.
		const supabase = sessionClient({ aal: { currentLevel: "aal1", nextLevel: "aal1", currentAuthenticationMethods: [{ method: "password", timestamp: 1 }] } });
		supabase.auth.getUser.mockResolvedValue({
			data: { user: { id: USER_ID, email: "user@example.com", app_metadata: { provider: "email" }, factors: [{ id: FACTOR_ID, status: "verified" }] } },
			error: null,
		});
		mockCreateClient.mockResolvedValue(supabase as never);
		adminClient();

		await expectActionError(() => revokeOtherSessionsAfterPasswordResetAction(), "Complete two-factor verification first");
		expect(supabase.auth.signOut).not.toHaveBeenCalled();
		expect(mockCreateAdminClient).not.toHaveBeenCalled();
	});

	it("an MFA account may revoke from the reset email's recovery session or after two-factor", async () => {
		for (const aal of [
			{ currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [{ method: "recovery", timestamp: 1 }] },
			{ currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: [{ method: "password", timestamp: 1 }, { method: "totp", timestamp: 2 }] },
		]) {
			const supabase = sessionClient({ aal });
			supabase.auth.getUser.mockResolvedValue({
				data: { user: { id: USER_ID, email: "user@example.com", app_metadata: { provider: "email" }, factors: [{ id: FACTOR_ID, status: "verified" }] } },
				error: null,
			});
			mockCreateClient.mockResolvedValue(supabase as never);
			const updates = adminClient();
			await expect(revokeOtherSessionsAfterPasswordResetAction()).resolves.toEqual({ success: true });
			expectOtherSessionsRevoked(supabase, updates);
		}
	});
});
