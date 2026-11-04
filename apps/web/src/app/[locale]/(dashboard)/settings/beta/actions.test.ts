import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { updateBetaPreferences } from "./actions";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: jest.fn() }));

describe("updateBetaPreferences", () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	it("only refreshes the user's beta settings page, never shared public pages", async () => {
		jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: "test-session" } as Awaited<ReturnType<typeof getServerAccountContext>>);
		const profile = { betaOptIn: true, betaFeatures: {} };
		jest.mocked(fetchAccountWebApi).mockResolvedValue({ ok: true, profile } as never);

		await expect(updateBetaPreferences({ beta_features: {} })).resolves.toEqual({ ok: true, profile });

		expect(revalidatePath).toHaveBeenCalledTimes(1);
		expect(revalidatePath).toHaveBeenCalledWith("/settings/beta");
	});

	it("rejects a signed-out caller without revalidating anything", async () => {
		jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: null } as Awaited<ReturnType<typeof getServerAccountContext>>);

		await expect(updateBetaPreferences({ beta_features: {} })).rejects.toThrow("Not authenticated");

		expect(fetchAccountWebApi).not.toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();
	});
});
