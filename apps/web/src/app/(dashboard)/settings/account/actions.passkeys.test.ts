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

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockCreateSupabaseAuthClient =
	createSupabaseAuthClient as jest.MockedFunction<
		typeof createSupabaseAuthClient
	>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;
const mockGetStripe = getStripe as jest.MockedFunction<typeof getStripe>;

function createSupabaseMock(options: {
	lastSignInAt?: string;
	provider?: string;
}) {
	const passkey = {
		delete: jest.fn().mockResolvedValue({ error: null }),
		startRegistration: jest.fn().mockResolvedValue({
			data: {
				challenge_id: "challenge_123",
				options: { challenge: "AQID", user: { id: "BAUG" } },
			},
			error: null,
		}),
		verifyRegistration: jest.fn().mockResolvedValue({ error: null }),
	};
	const user = {
		app_metadata: { provider: options.provider ?? "email" },
		email: "user@example.com",
		id: "11111111-1111-4111-8111-111111111111",
		last_sign_in_at: options.lastSignInAt ?? "2026-07-16T12:00:00.000Z",
	};
	return {
		auth: {
			getClaims: jest.fn().mockResolvedValue({
				data: { claims: { amr: [] } },
				error: null,
			}),
			getUser: jest.fn().mockResolvedValue({
				data: { user },
				error: null,
			}),
			mfa: {
				getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
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
		jest.clearAllMocks();
		jest.useRealTimers();
		process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
	});

	it("updates the declared country without writing the protected user id", async () => {
		const userId = "11111111-1111-4111-8111-111111111111";
		const selectEq = jest.fn().mockReturnValue({
			maybeSingle: jest.fn().mockResolvedValue({
				data: { declared_country_code: "US" },
				error: null,
			}),
		});
		const updateEq = jest.fn().mockResolvedValue({ error: null });
		const update = jest.fn().mockReturnValue({ eq: updateEq });
		const upsert = jest.fn();
		const from = jest.fn().mockReturnValue({
			select: jest.fn().mockReturnValue({ eq: selectEq }),
			update,
			upsert,
		});
		const supabase = { ...createSupabaseMock({}), from };
		mockCreateClient.mockResolvedValue(supabase as never);

		await expect(updateAccount({ declared_country_code: "GB" })).resolves.toEqual({ ok: true });

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
				signInWithPassword: jest.fn().mockResolvedValue({
					data: {
						user: { id: "11111111-1111-4111-8111-111111111111" },
					},
					error: null,
				}),
			},
		};
		mockCreateSupabaseAuthClient.mockReturnValue(passwordVerifier as never);

		const result = await startPasskeyRegistrationAction("current-password");

		expect(result.ok).toBe(true);
		expect(passwordVerifier.auth.signInWithPassword).toHaveBeenCalledWith({
			email: "user@example.com",
			password: "current-password",
		});
		expect(supabase.auth.passkey.startRegistration).toHaveBeenCalledTimes(1);
	});

	it("rejects stale passwordless sessions before starting registration", async () => {
		jest.useFakeTimers().setSystemTime(new Date("2026-07-16T12:10:00.000Z"));
		const supabase = createSupabaseMock({
			lastSignInAt: "2026-07-16T12:00:00.000Z",
			provider: "google",
		});
		mockCreateClient.mockResolvedValue(supabase as never);

		const result = await startPasskeyRegistrationAction();

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
				signInWithPassword: jest.fn().mockResolvedValue({
					data: {
						user: { id: "11111111-1111-4111-8111-111111111111" },
					},
					error: null,
				}),
			},
		};
		mockCreateSupabaseAuthClient.mockReturnValue(passwordVerifier as never);

		const result = await deletePasskeyAction(
			"22222222-2222-4222-8222-222222222222",
			"current-password",
		);

		expect(result.ok).toBe(true);
		expect(passwordVerifier.auth.signInWithPassword).toHaveBeenCalledTimes(1);
		expect(supabase.auth.passkey.delete).toHaveBeenCalledWith({
			passkeyId: "22222222-2222-4222-8222-222222222222",
		});
	});

	it("rejects malformed registration responses before opening Supabase", async () => {
		const result = await verifyPasskeyRegistrationAction("bad id!", {});

		expect(result).toMatchObject({ code: "invalid_request", ok: false });
		expect(mockCreateClient).not.toHaveBeenCalled();
	});

	it("queues external-store deletion before hard-deleting the Auth user", async () => {
		const supabase = createSupabaseMock({ provider: "email" });
		mockCreateClient.mockResolvedValue(supabase as never);
		mockCreateSupabaseAuthClient.mockReturnValue({
			auth: {
				signInWithPassword: jest.fn().mockResolvedValue({
					data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
					error: null,
				}),
			},
		} as never);

		const deleteUser = jest.fn().mockResolvedValue({ error: null });
		const insertJob = jest.fn();
		const deleteJob = jest.fn();
		const admin = {
			auth: { admin: { deleteUser } },
			from: jest.fn((table: string) => {
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
		const deleteStripeCustomer = jest.fn().mockResolvedValue({ id: "cus_1", deleted: true });
		mockGetStripe.mockReturnValue({ customers: { del: deleteStripeCustomer } } as never);

		const result = await deleteAccount("DELETE", "current-password");

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
