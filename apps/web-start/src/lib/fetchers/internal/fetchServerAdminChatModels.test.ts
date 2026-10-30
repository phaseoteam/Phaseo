const role = jest.fn();
const account = jest.fn();
const api = jest.fn();
jest.mock("@/lib/auth/getViewerRole", () => ({ isAdminViewer: () => role() }));
jest.mock("./serverAccountContext", () => ({ getServerAccountContext: () => account() }));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: (...args: unknown[]) => api(...args) }));
import { fetchServerAdminChatModels } from "./fetchServerAdminChatModels";

beforeEach(() => { jest.resetAllMocks(); });
it("never fetches internal records for non-admin viewers", async () => {
	role.mockResolvedValue(false);
	expect(await fetchServerAdminChatModels()).toEqual([]);
	expect(api).not.toHaveBeenCalled();
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
it("loads every hidden model and route in one request", async () => {
	role.mockResolvedValue(true); account.mockResolvedValue({ accessToken: "admin-token" });
	api.mockResolvedValue({
		models: [{ model_id: "test/internal", hidden: true, status: "active", name: "Internal", lab_slug: "test" }],
		providerRows: [{ model_id: "test/internal", provider_id: "test", access_scope: "internal", phaseo_status: "testing", routing_status: "active",
			provider_availability_status: "available", data_api_provider_model_capabilities: [{ capability_id: "text.generate", status: "active" }] }],
	});
	expect(await fetchServerAdminChatModels()).toMatchObject([{ modelId: "test/internal", providerId: "test" }]);
	expect(api).toHaveBeenCalledTimes(1);
	expect(api).toHaveBeenCalledWith("/api/account/models/hidden?includeRoutes=true", "admin-token");
});
it("keeps the playground usable when the hidden model request fails", async () => {
	role.mockResolvedValue(true); account.mockResolvedValue({ accessToken: "admin-token" });
	api.mockRejectedValue(new Error("unavailable"));
	expect(await fetchServerAdminChatModels()).toEqual([]);
});
