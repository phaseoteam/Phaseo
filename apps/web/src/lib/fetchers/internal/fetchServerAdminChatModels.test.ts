const role = jest.fn();
const account = jest.fn();
const api = jest.fn();
const source = jest.fn();
jest.mock("@/lib/auth/getViewerRole", () => ({ isAdminViewer: () => role() }));
jest.mock("./serverAccountContext", () => ({ getServerAccountContext: () => account() }));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: (...args: unknown[]) => api(...args) }));
jest.mock("./fetchAdminModelSource", () => ({ fetchAdminModelSource: (...args: unknown[]) => source(...args) }));
import { fetchServerAdminChatModels } from "./fetchServerAdminChatModels";

beforeEach(() => { jest.resetAllMocks(); });
it("never fetches internal records for non-admin viewers", async () => {
	role.mockResolvedValue(false);
	expect(await fetchServerAdminChatModels()).toEqual([]);
	expect(api).not.toHaveBeenCalled();
	expect(source).not.toHaveBeenCalled();
});
it("fails closed when admin verification is unavailable", async () => {
	role.mockRejectedValue(new Error("unavailable"));
	expect(await fetchServerAdminChatModels()).toEqual([]);
	expect(api).not.toHaveBeenCalled();
});
it("does not request hidden data without an authenticated token", async () => {
	role.mockResolvedValue(true); account.mockResolvedValue({ accessToken: null });
	expect(await fetchServerAdminChatModels()).toEqual([]);
	expect(api).not.toHaveBeenCalled();
});
