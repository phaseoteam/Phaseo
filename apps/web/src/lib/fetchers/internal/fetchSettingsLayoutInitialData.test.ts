import { fetchSettingsLayoutInitialData } from "./fetchSettingsLayoutInitialData";
import { getServerAccountContext } from "./serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
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

describe("fetchSettingsLayoutInitialData", () => {
	let warn: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
		warn = jest.spyOn(console, "warn").mockImplementation(() => {});
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
