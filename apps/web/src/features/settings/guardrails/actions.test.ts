import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("@/lib/fetchers/internal/serverAccountContext", () => ({
	getServerAccountContext: vi.fn(),
}));
vi.mock("@/lib/web-api/client", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/web-api/client")>()),
	fetchAccountWebApi: vi.fn(),
}));

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { updateGlobalGuardrailsSettings, updateGuardrailAssignments } from "@/features/settings/guardrails/actions";

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

	it("sends assignment changes as an add/remove delta for the rendered workspace", async () => {
		await updateGuardrailAssignments({ data: { change: { targetType: "key", targetIds: ["key-1", "key-2"], addGuardrailIds: ["guardrail-1"] }, expectedWorkspaceId: "workspace-a" } });

		expect(mockFetchAccountWebApi).toHaveBeenCalledWith(
			"/api/account/settings/guardrails/assignments",
			"access-token",
			expect.objectContaining({
				method: "PATCH",
				body: JSON.stringify({
					targetType: "key",
					targetIds: ["key-1", "key-2"],
					addGuardrailIds: ["guardrail-1"],
					workspaceId: "workspace-a",
				}),
			}),
		);
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await expect(
			updateGuardrailAssignments({ data: { change: { targetType: "member", targetIds: ["user-1"], removeGuardrailIds: ["guardrail-1"] }, expectedWorkspaceId: "workspace-b" } }),
		).rejects.toThrow("Server action failed");
		expect(log).toHaveBeenCalledWith(expect.stringContaining("[server-action]"), expect.objectContaining({ message: expect.stringContaining("Active workspace changed") }));
		log.mockRestore();
	});

	it("returns the server's reason for a refused assignment change", async () => {
		const change = { targetType: "key" as const, targetIds: ["key-1"], addGuardrailIds: ["guardrail-1"] };
		mockFetchAccountWebApi.mockRejectedValueOnce(new WebApiError("/assignments", 409, "One or more keys do not belong to this workspace", undefined, "One or more keys do not belong to this workspace"));
		await expect(updateGuardrailAssignments({ data: { change, expectedWorkspaceId: "workspace-a" } }))
			.resolves.toEqual({ ok: false, error: "One or more keys do not belong to this workspace" });
		mockFetchAccountWebApi.mockRejectedValueOnce(new WebApiError("/assignments", 503, "guardrail_write_failed", undefined, "guardrail_write_failed"));
		await expect(updateGuardrailAssignments({ data: { change, expectedWorkspaceId: "workspace-a" } }))
			.resolves.toEqual({ ok: false, error: null });
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
