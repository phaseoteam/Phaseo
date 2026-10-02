import { fetchSettingsKeyDetailByName } from "./fetchSettingsKeyDetail";
import { fetchSettingsKeysInitialData } from "./fetchSettingsKeysInitialData";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { keyDetailHref } from "@/components/(gateway)/settings/keys/keyDetailHref";

jest.mock("./fetchSettingsKeysInitialData", () => ({ fetchSettingsKeysInitialData: jest.fn() }));
jest.mock("./serverAccountContext", () => ({ getServerAccountContext: async () => ({ accessToken: "token" }) }));
jest.mock("@/lib/web-api/client", () => ({ ...jest.requireActual("@/lib/web-api/client"), fetchAccountWebApi: jest.fn() }));
const initial = jest.mocked(fetchSettingsKeysInitialData);
const fetchApi = jest.mocked(fetchAccountWebApi);

describe("name-based key routes", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		initial.mockResolvedValue({ currentUserId: "user", initialWorkspaceId: "workspace", workspaces: [], teamsWithKeys: [{ id: "workspace", name: "Workspace", keys: [
			{ id: "key-1", name: "Production / EU", prefix: "first", workspace_id: "workspace" },
			{ id: "key-2", name: "Production / EU", prefix: "second", workspace_id: "workspace" },
		] }] });
		fetchApi.mockResolvedValue({ key: { id: "key-2", name: "Production / EU" } });
	});
	it("encodes names and includes the prefix instead of the key ID", () => {
		expect(keyDetailHref({ name: "Production / EU", prefix: "second", workspace_id: "workspace" })).toBe("/settings/keys/Production%20%2F%20EU?workspaceId=workspace&prefix=second");
	});
	it("resolves duplicate names by prefix within the workspace", async () => {
		await fetchSettingsKeyDetailByName("Production / EU", "workspace", "second");
		expect(fetchApi).toHaveBeenCalledWith("/api/account/settings/keys/key-2", "token");
	});
	it("keeps bookmarked prefix links resolvable after renaming", async () => {
		await fetchSettingsKeyDetailByName("Old name", "workspace", "second");
		expect(fetchApi).toHaveBeenCalledWith("/api/account/settings/keys/key-2", "token");
	});
	it("rejects ambiguous links instead of opening an arbitrary key", async () => {
		await expect(fetchSettingsKeyDetailByName("Production / EU", "workspace")).rejects.toMatchObject({ status: 409 });
		expect(fetchApi).not.toHaveBeenCalled();
	});
	it("does not resolve keys from a different workspace", async () => {
		await expect(fetchSettingsKeyDetailByName("Production / EU", "other", "second")).rejects.toMatchObject({ status: 404 });
		expect(fetchApi).not.toHaveBeenCalled();
	});
});
