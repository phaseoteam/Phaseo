import { fetchInternalAuthStatus } from "./fetchInternalAuthStatus";
import { createClient } from "@/utils/supabase/server";
import { fetchAccountWebApi } from "@/lib/web-api/client";

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: jest.fn() }));

describe("server authentication status loading", () => {
	const getSession = jest.fn();
	beforeEach(() => {
		jest.resetAllMocks();
		jest.mocked(createClient).mockResolvedValue({ auth: { getSession } } as never);
	});

	it("returns anonymous status without calling the account API", async () => {
		getSession.mockResolvedValue({ data: { session: null } });
		await expect(fetchInternalAuthStatus()).resolves.toEqual({ isAdmin: false, role: null, signedIn: false });
		expect(fetchAccountWebApi).not.toHaveBeenCalled();
	});

	it("validates authenticated status through the account API", async () => {
		getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } } });
		const status = { isAdmin: true, role: "admin", signedIn: true };
		jest.mocked(fetchAccountWebApi).mockResolvedValue(status);
		await expect(fetchInternalAuthStatus()).resolves.toEqual(status);
		expect(fetchAccountWebApi).toHaveBeenCalledWith("/api/account/auth/status", "test-token");
	});
});
