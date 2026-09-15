jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({
	getServerAccountContext: jest.fn(),
}));
jest.mock("@/lib/web-api/client", () => ({
	fetchAccountWebApi: jest.fn(),
}));

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { updateGlobalGuardrailsSettings } from "./actions";

const mockGetServerAccountContext = jest.mocked(getServerAccountContext);
const mockFetchAccountWebApi = jest.mocked(fetchAccountWebApi);

describe("workspace guardrail server actions", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGetServerAccountContext.mockResolvedValue({
			accessToken: "access-token",
			workspaceId: "workspace-a",
		} as never);
		mockFetchAccountWebApi.mockResolvedValue({ success: true });
	});

	it("saves policy changes to the workspace rendered by the client", async () => {
		await updateGlobalGuardrailsSettings({ privacyZdrOnly: true }, "workspace-a");

		expect(mockFetchAccountWebApi).toHaveBeenCalledWith(
			"/api/account/settings/guardrails/global",
			"access-token",
			expect.objectContaining({
				method: "PUT",
				body: JSON.stringify({
					privacyZdrOnly: true,
					workspaceId: "workspace-a",
				}),
			}),
		);
	});

	it("rejects a save after the active workspace changes", async () => {
		await expect(
			updateGlobalGuardrailsSettings({ privacyZdrOnly: true }, "workspace-b"),
		).rejects.toThrow("Active workspace changed");

		expect(mockFetchAccountWebApi).not.toHaveBeenCalled();
	});
});
