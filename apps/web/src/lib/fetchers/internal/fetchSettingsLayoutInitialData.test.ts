import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { fetchSettingsLayoutInitialData } from "./fetchSettingsLayoutInitialData";
import { getServerAccountContext } from "./serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { resolveAccessibleWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

vi.mock("./serverAccountContext", () => ({ getServerAccountContext: vi.fn() }));
vi.mock("@/lib/web-api/client", async () => {
	const actual = await vi.importActual("@/lib/web-api/client");
	return { ...actual, fetchAccountWebApi: vi.fn() };
});
vi.mock("@/utils/workspaceCookie", () => ({
	resolveAccessibleWorkspaceIdFromCookie: vi.fn(),
}));

const getServerAccountContextMock = vi.mocked(getServerAccountContext);
const fetchAccountWebApiMock = vi.mocked(fetchAccountWebApi);
const resolveAccessibleWorkspaceIdMock = vi.mocked(resolveAccessibleWorkspaceIdFromCookie);

describe("fetchSettingsLayoutInitialData", () => {
	let warn: MockInstance;

	beforeEach(() => {
		vi.clearAllMocks();
		warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		getServerAccountContextMock.mockResolvedValue({
			accessToken: "access-token",
			obfuscateInfo: false,
			workspaceId: "stale-workspace",
		});
		resolveAccessibleWorkspaceIdMock.mockResolvedValue("accessible-workspace");
		fetchAccountWebApiMock.mockResolvedValue({
			isEnterpriseInvoiceMode: false,
			showBroadcast: false,
			signedIn: true,
			workspaceId: "accessible-workspace",
			workspaceName: "Workspace",
			accountContext: null,
		});
	});

	afterEach(() => warn.mockRestore());

	it("uses the authenticated workspace instead of a stale cookie selection", async () => {
		await fetchSettingsLayoutInitialData();

		expect(resolveAccessibleWorkspaceIdMock).toHaveBeenCalledWith({ throwOnFailure: true });
		expect(fetchAccountWebApiMock).toHaveBeenCalledWith(
			"/api/account/settings/layout?workspaceId=accessible-workspace",
			"access-token",
		);
		expect(warn).toHaveBeenCalledWith(
			"[settings-layout] active workspace is no longer accessible",
			{ fallback: "accessible_workspace" },
		);
	});

	it("loads account-level settings when there is no accessible workspace", async () => {
		resolveAccessibleWorkspaceIdMock.mockResolvedValueOnce(undefined);

		await fetchSettingsLayoutInitialData();

		expect(fetchAccountWebApiMock).toHaveBeenCalledWith(
			"/api/account/settings/layout",
			"access-token",
		);
	});
});
