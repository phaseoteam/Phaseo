import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchInternalAuthStatus } from "./fetchInternalAuthStatus";
import { createClient } from "@/utils/supabase/server";
import { fetchAccountWebApi } from "@/lib/web-api/client";

vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: vi.fn() }));

describe("server authentication status loading", () => {
	const getSession = vi.fn();
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(createClient).mockResolvedValue({ auth: { getSession } } as never);
	});

	it("returns anonymous status without calling the account API", async () => {
		getSession.mockResolvedValue({ data: { session: null } });
		await expect(fetchInternalAuthStatus()).resolves.toEqual({ isAdmin: false, role: null, signedIn: false });
		expect(fetchAccountWebApi).not.toHaveBeenCalled();
	});

	it("validates authenticated status through the account API", async () => {
		getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } } });
		const status = { isAdmin: true, role: "admin", signedIn: true };
		vi.mocked(fetchAccountWebApi).mockResolvedValue(status);
		await expect(fetchInternalAuthStatus()).resolves.toEqual(status);
		expect(fetchAccountWebApi).toHaveBeenCalledWith("/api/account/auth/status", "test-token");
	});
});
