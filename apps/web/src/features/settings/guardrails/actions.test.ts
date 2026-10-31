import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("@/lib/fetchers/internal/serverAccountContext", () => ({
	getServerAccountContext: vi.fn(),
}));
vi.mock("@/lib/web-api/client", () => ({
	fetchAccountWebApi: vi.fn(),
}));

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { updateGlobalGuardrailsSettings } from "@/features/settings/guardrails/actions";

const mockGetServerAccountContext = vi.mocked(getServerAccountContext);
const mockFetchAccountWebApi = vi.mocked(fetchAccountWebApi);

describe("workspace guardrail server actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetServerAccountContext.mockResolvedValue({
			accessToken: "access-token",
			workspaceId: "workspace-a",
		} as never);
		mockFetchAccountWebApi.mockResolvedValue({ success: true });
	});

	it("saves policy changes to the workspace rendered by the client", async () => {
		await updateGlobalGuardrailsSettings({ data: { payload: { privacyZdrOnly: true }, expectedWorkspaceId: "workspace-a" } });

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
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		// The serverAction middleware logs the real error and sends the browser a generic one.
		await expect(
			updateGlobalGuardrailsSettings({ data: { payload: { privacyZdrOnly: true }, expectedWorkspaceId: "workspace-b" } }),
		).rejects.toThrow("Server action failed");
		expect(log).toHaveBeenCalledWith(expect.stringContaining("[server-action]"), expect.objectContaining({ message: expect.stringContaining("Active workspace changed") }));
		log.mockRestore();

		expect(mockFetchAccountWebApi).not.toHaveBeenCalled();
	});
});
