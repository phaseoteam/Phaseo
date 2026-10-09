import { fetchAdminStagedModels } from "./stagedModels";
jest.mock("@/lib/fetchers/internal/accountAuthClient", () => ({ getBrowserAccessToken: jest.fn() }));

describe("staged catalogue access", () => {
	const originalFetch = global.fetch;
	afterEach(() => { global.fetch = originalFetch; });
	it("does not request staged data when signed out", async () => {
		global.fetch = jest.fn();
		expect(await fetchAdminStagedModels({ accessToken: null })).toEqual([]);
		expect(global.fetch).not.toHaveBeenCalled();
	});
	it("keeps forbidden staged data out of the normal user's catalogue", async () => {
		global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
		expect(await fetchAdminStagedModels({ accessToken: "user-token" })).toEqual([]);
	});
	it("preserves the public catalogue when the staged overlay is unavailable", async () => {
		global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }));
		expect(await fetchAdminStagedModels({ accessToken: "admin-token" })).toEqual([]);
		global.fetch = jest.fn().mockRejectedValue(new Error("network unavailable"));
		expect(await fetchAdminStagedModels({ accessToken: "admin-token" })).toEqual([]);
	});
	it("propagates cancellation", async () => {
		const error = new DOMException("Cancelled", "AbortError");
		global.fetch = jest.fn().mockRejectedValue(error);
		await expect(fetchAdminStagedModels({ accessToken: "admin-token" })).rejects.toBe(error);
	});
	it("loads hidden rows through the authenticated no-store admin endpoint", async () => {
		global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ models: [
			{ model_id: "test/staged", name: "Staged", hidden: true, organisation: { lab_slug: "test", name: "Test lab" } },
			{ model_id: "test/public", hidden: false },
		] })));
		expect(await fetchAdminStagedModels({ accessToken: "admin-token" })).toMatchObject([
			{ model_id: "test/staged", organisation_name: "Test lab", gateway_active_provider_count: 0 },
		]);
		expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/account/models/audit/source?includeHidden=true"), expect.objectContaining({ cache: "no-store", headers: expect.objectContaining({ Authorization: "Bearer admin-token" }) }));
	});
});
