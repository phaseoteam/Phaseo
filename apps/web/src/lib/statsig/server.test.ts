import { getServerStatsigUser } from "./server";
import { cookies } from "next/headers";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { buildAnonymousStatsigUser, EMPTY_STATSIG_PROFILE } from "./shared";

jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("next/cache", () => ({ io: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@flags-sdk/statsig", () => ({ Statsig: {}, createStatsigAdapter: jest.fn(() => null) }));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: jest.fn() }));

describe("server feature flag identity", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.mocked(cookies).mockResolvedValue({ get: () => ({ value: "stable-id" }) } as never);
	});

	it("builds anonymous identity without an account API request", async () => {
		jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: null, obfuscateInfo: null, workspaceId: null });
		await expect(getServerStatsigUser()).resolves.toEqual(buildAnonymousStatsigUser("stable-id"));
		expect(fetchAccountWebApi).not.toHaveBeenCalled();
	});

	it("preserves remote identity validation and workspace targeting for signed-in users", async () => {
		jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: "test-token", obfuscateInfo: null, workspaceId: "workspace-id" });
		jest.mocked(fetchAccountWebApi).mockResolvedValue({ signedIn: true, user: { id: "user-id", email: "user@example.test" }, profile: EMPTY_STATSIG_PROFILE });
		const user = await getServerStatsigUser();
		expect(fetchAccountWebApi).toHaveBeenCalledWith("/api/account/auth/statsig", "test-token");
		expect(user.userID).toBe("user-id");
		expect(user.customIDs?.workspaceID).toBe("workspace-id");
	});
});
