import { fetchSettingsUsageLogsInitialData } from "./fetchSettingsUsageLogsInitialData";
import { getServerAccountContext } from "./serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { resolveAccessibleWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

jest.mock("./serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));
jest.mock("@/lib/web-api/client", () => {
	const actual = jest.requireActual("@/lib/web-api/client");
	return { ...actual, fetchAccountWebApi: jest.fn() };
});
jest.mock("@/utils/workspaceCookie", () => ({
	resolveAccessibleWorkspaceIdFromCookie: jest.fn(),
}));

const getServerAccountContextMock = jest.mocked(getServerAccountContext);
const fetchAccountWebApiMock = jest.mocked(fetchAccountWebApi);
const resolveAccessibleWorkspaceIdMock = jest.mocked(resolveAccessibleWorkspaceIdFromCookie);

describe("fetchSettingsUsageLogsInitialData", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		getServerAccountContextMock.mockResolvedValue({
			accessToken: "access-token",
			obfuscateInfo: false,
			workspaceId: "stale-workspace",
		});
		resolveAccessibleWorkspaceIdMock.mockResolvedValue("accessible-workspace");
		fetchAccountWebApiMock.mockResolvedValue({
			data: null,
			signedIn: true,
			view: "logs",
			workspaceId: "accessible-workspace",
		});
	});

	it("replaces a stale cookie workspace with the validated accessible workspace", async () => {
		const result = await fetchSettingsUsageLogsInitialData({ status: "failed" });

		expect(resolveAccessibleWorkspaceIdMock).toHaveBeenCalledWith({ throwOnFailure: true });
		expect(fetchAccountWebApiMock).toHaveBeenCalledWith(
			"/api/account/settings/usage/logs?status=failed&workspaceId=accessible-workspace",
			"access-token",
		);
		expect(result).toMatchObject({
			loadState: "ready",
			workspaceId: "accessible-workspace",
		});
	});

	it("distinguishes signed-out and no-workspace states", async () => {
		getServerAccountContextMock.mockResolvedValueOnce({
			accessToken: null,
			obfuscateInfo: false,
			workspaceId: null,
		});
		await expect(fetchSettingsUsageLogsInitialData(undefined)).resolves.toMatchObject({
			loadState: "unauthorized",
			signedIn: false,
		});

		resolveAccessibleWorkspaceIdMock.mockResolvedValueOnce(undefined);
		await expect(fetchSettingsUsageLogsInitialData({ view: "sessions" })).resolves.toMatchObject({
			loadState: "no_workspace",
			signedIn: true,
			view: "sessions",
		});
	});

	it("keeps the key's workspace when navigating from a key detail page", async () => {
		await fetchSettingsUsageLogsInitialData({ workspaceId: "key-workspace", key: "key-1" });
		expect(resolveAccessibleWorkspaceIdMock).not.toHaveBeenCalled();
		expect(fetchAccountWebApiMock).toHaveBeenCalledWith(
			"/api/account/settings/usage/logs?workspaceId=key-workspace&key=key-1", "access-token",
		);
	});

	it("distinguishes validation failures from an unavailable workspace", async () => {
		resolveAccessibleWorkspaceIdMock.mockRejectedValueOnce(new Error("workspace lookup failed"));

		await expect(fetchSettingsUsageLogsInitialData(undefined)).resolves.toMatchObject({
			loadState: "failed",
			signedIn: true,
		});
		expect(fetchAccountWebApiMock).not.toHaveBeenCalled();
	});

	it("reports a forbidden state when access changes after validation", async () => {
		fetchAccountWebApiMock.mockRejectedValueOnce(
			new WebApiError("/api/account/settings/usage/logs", 403, "forbidden"),
		);

		await expect(fetchSettingsUsageLogsInitialData({ view: "upstream" })).resolves.toMatchObject({
			loadState: "forbidden",
			signedIn: true,
			view: "upstream",
			workspaceId: "accessible-workspace",
		});
	});
});
