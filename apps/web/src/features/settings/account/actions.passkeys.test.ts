import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
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
	deleteAccount,
	deletePasskeyAction,
	startPasskeyRegistrationAction,
	updateAccount,
	verifyPasskeyRegistrationAction,
} from "./actions";
import { createClient } from "@/utils/supabase/server";
import { createClient as createSupabaseAuthClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { getStripe } from "@/lib/stripe";

const mockCreateClient = createClient as MockedFunction<typeof createClient>;
const mockCreateSupabaseAuthClient =
	createSupabaseAuthClient as MockedFunction<
		typeof createSupabaseAuthClient
	>;
const mockCreateAdminClient = createAdminClient as MockedFunction<typeof createAdminClient>;
const mockGetStripe = getStripe as MockedFunction<typeof getStripe>;

function createSupabaseMock(options: {
	lastSignInAt?: string;
	provider?: string;
}) {
	const passkey = {
		delete: vi.fn().mockResolvedValue({ error: null }),
		startRegistration: vi.fn().mockResolvedValue({
			data: {
				challenge_id: "challenge_123",
				options: { challenge: "AQID", user: { id: "BAUG" } },
			},
			error: null,
		}),
		verifyRegistration: vi.fn().mockResolvedValue({ error: null }),
	};
	const user = {
		app_metadata: { provider: options.provider ?? "email" },
		email: "user@example.com",
		id: "11111111-1111-4111-8111-111111111111",
		last_sign_in_at: options.lastSignInAt ?? "2026-07-16T12:00:00.000Z",
	};
	return {
		auth: {
			getClaims: vi.fn().mockResolvedValue({
				data: { claims: { amr: [] } },
				error: null,
			}),
			getUser: vi.fn().mockResolvedValue({
				data: { user },
				error: null,
			}),
			mfa: {
				getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
					data: { currentLevel: "aal1", nextLevel: "aal1" },
					error: null,
				}),
			},
			passkey,
		},
	};
}

describe("passkey server actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
		process.env.PUBLIC_SUPABASE_URL = "https://example.supabase.co";
		process.env.PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
	});

	it("updates the declared country without writing the protected user id", async () => {
		const userId = "11111111-1111-4111-8111-111111111111";
		const selectEq = vi.fn().mockReturnValue({
			maybeSingle: vi.fn().mockResolvedValue({
				data: { declared_country_code: "US" },
				error: null,
			}),
		});
		const updateEq = vi.fn().mockResolvedValue({ error: null });
		const update = vi.fn().mockReturnValue({ eq: updateEq });
		const upsert = vi.fn();
		const from = vi.fn().mockReturnValue({
			select: vi.fn().mockReturnValue({ eq: selectEq }),
			update,
			upsert,
		});
		const supabase = { ...createSupabaseMock({}), from };
		mockCreateClient.mockResolvedValue(supabase as never);

		await expect(updateAccount({ data: { declared_country_code: "GB" } })).resolves.toEqual({ ok: true });

		expect(update).toHaveBeenCalledWith({
			declared_country_code: "GB",
			country_declared_at: expect.any(String),
		});
		expect(updateEq).toHaveBeenCalledWith("user_id", userId);
		expect(upsert).not.toHaveBeenCalled();
	});

	it("verifies the current password before starting registration", async () => {
		const supabase = createSupabaseMock({ provider: "email" });
		mockCreateClient.mockResolvedValue(supabase as never);
		const passwordVerifier = {
			auth: {
				signInWithPassword: vi.fn().mockResolvedValue({
					data: {
						user: { id: "11111111-1111-4111-8111-111111111111" },
					},
					error: null,
				}),
			},
		};
		mockCreateSupabaseAuthClient.mockReturnValue(passwordVerifier as never);

		const result = await startPasskeyRegistrationAction({ data: "current-password" });

		expect(result.ok).toBe(true);
		expect(passwordVerifier.auth.signInWithPassword).toHaveBeenCalledWith({
			email: "user@example.com",
			password: "current-password",
		});
		expect(supabase.auth.passkey.startRegistration).toHaveBeenCalledTimes(1);
	});

	it("rejects stale passwordless sessions before starting registration", async () => {
		vi.useFakeTimers().setSystemTime(new Date("2026-07-16T12:10:00.000Z"));
		const supabase = createSupabaseMock({
			lastSignInAt: "2026-07-16T12:00:00.000Z",
			provider: "google",
		});
		mockCreateClient.mockResolvedValue(supabase as never);

		const result = await startPasskeyRegistrationAction({ data: undefined });

		expect(result).toMatchObject({
			code: "fresh_sign_in_required",
			ok: false,
		});
		expect(supabase.auth.passkey.startRegistration).not.toHaveBeenCalled();
	});

	it("deletes a passkey only after server-side password verification", async () => {
		const supabase = createSupabaseMock({ provider: "email" });
		mockCreateClient.mockResolvedValue(supabase as never);
		const passwordVerifier = {
			auth: {
				signInWithPassword: vi.fn().mockResolvedValue({
					data: {
						user: { id: "11111111-1111-4111-8111-111111111111" },
					},
					error: null,
				}),
			},
		};
		mockCreateSupabaseAuthClient.mockReturnValue(passwordVerifier as never);

		const result = await deletePasskeyAction({ data: {
			passkeyId: "22222222-2222-4222-8222-222222222222",
			currentPassword: "current-password",
		} });

		expect(result.ok).toBe(true);
		expect(passwordVerifier.auth.signInWithPassword).toHaveBeenCalledTimes(1);
		expect(supabase.auth.passkey.delete).toHaveBeenCalledWith({
			passkeyId: "22222222-2222-4222-8222-222222222222",
		});
	});

	it("rejects malformed registration responses before opening Supabase", async () => {
		const result = await verifyPasskeyRegistrationAction({ data: { challengeId: "bad id!", credential: {} } });

		expect(result).toMatchObject({ code: "invalid_request", ok: false });
		expect(mockCreateClient).not.toHaveBeenCalled();
	});

	it("queues external-store deletion before hard-deleting the Auth user", async () => {
		const supabase = createSupabaseMock({ provider: "email" });
		mockCreateClient.mockResolvedValue(supabase as never);
		mockCreateSupabaseAuthClient.mockReturnValue({
			auth: {
				signInWithPassword: vi.fn().mockResolvedValue({
					data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
					error: null,
				}),
			},
		} as never);

		const deleteUser = vi.fn().mockResolvedValue({ error: null });
		const insertJob = vi.fn();
		const deleteJob = vi.fn();
		const admin = {
			auth: { admin: { deleteUser } },
			from: vi.fn((table: string) => {
				if (table === "workspaces") return { select: () => ({ eq: async () => ({ data: [{ id: "22222222-2222-4222-8222-222222222222" }], error: null }) }) };
				if (table === "keys") return { select: () => ({ in: async () => ({ data: [{ id: "33333333-3333-4333-8333-333333333333", kid: "kid_1" }], error: null }) }) };
				if (table === "wallets") return { select: () => ({ in: async () => ({ data: [{ stripe_customer_id: "cus_1" }], error: null }) }) };
				return {
					select: () => ({ eq: () => ({ neq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
					insert: (payload: unknown) => {
						insertJob(payload);
						return { select: () => ({ single: async () => ({ data: { id: "job_1" }, error: null }) }) };
					},
					delete: () => ({ eq: deleteJob }),
				};
			}),
		};
		mockCreateAdminClient.mockReturnValue(admin as never);
		const deleteStripeCustomer = vi.fn().mockResolvedValue({ id: "cus_1", deleted: true });
		mockGetStripe.mockReturnValue({ customers: { del: deleteStripeCustomer } } as never);

		const result = await deleteAccount({ data: { confirmation: "DELETE", currentPassword: "current-password" } });

		expect(result).toMatchObject({ ok: true, deletionJobId: "job_1" });
		expect(insertJob).toHaveBeenCalledWith(expect.objectContaining({
			user_id: "11111111-1111-4111-8111-111111111111",
			workspace_ids: ["22222222-2222-4222-8222-222222222222"],
			key_ids: ["33333333-3333-4333-8333-333333333333"],
			key_kids: ["kid_1"],
		}));
		expect(deleteStripeCustomer).toHaveBeenCalledWith("cus_1");
		expect(deleteUser).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", false);
		expect(insertJob.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]);
		expect(deleteJob).not.toHaveBeenCalled();
	});
});
