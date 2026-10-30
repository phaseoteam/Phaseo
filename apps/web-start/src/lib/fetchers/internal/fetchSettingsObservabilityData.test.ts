import { fetchSettingsObservabilityData } from "./fetchSettingsObservabilityData";
import { getServerAccountContext } from "./serverAccountContext";
import { resolveAccessibleWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { fetchAccountWebApi } from "@/lib/web-api/client";

jest.mock("./serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));
jest.mock("@/utils/workspaceCookie", () => ({
	resolveAccessibleWorkspaceIdFromCookie: jest.fn(),
}));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: jest.fn() }));

const mockGetServerAccountContext = jest.mocked(getServerAccountContext);
const mockResolveAccessibleWorkspaceIdFromCookie = jest.mocked(
	resolveAccessibleWorkspaceIdFromCookie,
);
const mockFetchAccountWebApi = jest.mocked(fetchAccountWebApi);

const request = {
	from: "2026-08-01T00:00:00.000Z",
	to: "2026-08-02T00:00:00.000Z",
	previousFrom: "2026-07-31T00:00:00.000Z",
	previousTo: "2026-08-01T00:00:00.000Z",
};

describe("fetchSettingsObservabilityData", () => {
	beforeEach(() => {
		jest.resetAllMocks();
		mockGetServerAccountContext.mockResolvedValue({
			accessToken: "token",
			obfuscateInfo: null,
			workspaceId: "stale-workspace",
		});
	});

	it("always validates an active workspace cookie before loading usage data", async () => {
		mockResolveAccessibleWorkspaceIdFromCookie.mockResolvedValue("accessible-workspace");
		mockFetchAccountWebApi.mockResolvedValue({ workspaceId: "accessible-workspace" });

		await expect(fetchSettingsObservabilityData(request)).resolves.toEqual({
			status: "loaded",
			data: { workspaceId: "accessible-workspace" },
		});
		expect(mockResolveAccessibleWorkspaceIdFromCookie).toHaveBeenCalledWith({
			throwOnFailure: true,
		});
		expect(mockFetchAccountWebApi).toHaveBeenCalledWith(
			expect.stringContaining("workspaceId=accessible-workspace"),
			"token",
		);
		expect(mockFetchAccountWebApi).not.toHaveBeenCalledWith(
			expect.stringContaining("workspaceId=stale-workspace"),
			expect.anything(),
		);
	});

	it("returns no-workspace without requesting usage data", async () => {
		mockResolveAccessibleWorkspaceIdFromCookie.mockResolvedValue(undefined);

		await expect(fetchSettingsObservabilityData(request)).resolves.toEqual({
			status: "no-workspace",
		});
		expect(mockFetchAccountWebApi).not.toHaveBeenCalled();
	});

	it("forwards the creator chip's workspace and user filter", async () => {
		mockFetchAccountWebApi.mockResolvedValue({ workspaceId: "chip-workspace" });
		await fetchSettingsObservabilityData({ ...request, workspaceId: "chip-workspace", creatorId: "creator-id" });
		expect(mockResolveAccessibleWorkspaceIdFromCookie).not.toHaveBeenCalled();
		expect(mockFetchAccountWebApi).toHaveBeenCalledWith(expect.stringMatching(/workspaceId=chip-workspace.*user=creator-id/), "token");
	});

	it("returns unauthenticated without resolving a workspace", async () => {
		mockGetServerAccountContext.mockResolvedValue({
			accessToken: null,
			obfuscateInfo: null,
			workspaceId: "stale-workspace",
		});

		await expect(fetchSettingsObservabilityData(request)).resolves.toEqual({
			status: "unauthenticated",
		});
		expect(mockResolveAccessibleWorkspaceIdFromCookie).not.toHaveBeenCalled();
		expect(mockFetchAccountWebApi).not.toHaveBeenCalled();
	});

	it("returns load-failed when workspace validation fails", async () => {
		mockResolveAccessibleWorkspaceIdFromCookie.mockRejectedValue(new Error("unavailable"));

		await expect(fetchSettingsObservabilityData(request)).resolves.toEqual({
			status: "load-failed",
		});
		expect(mockFetchAccountWebApi).not.toHaveBeenCalled();
	});

	it("returns load-failed when the observability request fails", async () => {
		mockResolveAccessibleWorkspaceIdFromCookie.mockResolvedValue("accessible-workspace");
		mockFetchAccountWebApi.mockRejectedValue(new Error("unavailable"));

		await expect(fetchSettingsObservabilityData(request)).resolves.toEqual({
			status: "load-failed",
		});
	});

	it("forwards a selected request label", async () => {
		mockResolveAccessibleWorkspaceIdFromCookie.mockResolvedValue("accessible-workspace");
		mockFetchAccountWebApi.mockResolvedValue({ workspaceId: "accessible-workspace" });

		await fetchSettingsObservabilityData({ ...request, labelKey: "team", labelValue: "support" });

		expect(mockFetchAccountWebApi).toHaveBeenCalledWith(
			expect.stringContaining("label_key=team&label_value=support"),
			"token",
		);
	});
});
