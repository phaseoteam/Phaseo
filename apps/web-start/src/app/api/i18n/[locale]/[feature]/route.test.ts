import { GET } from "./route";

describe("optional message endpoint", () => {
	it.each(["invalid", "constructor", "__proto__"])("rejects unsupported feature %s", async (feature) => {
		const response = await GET(new Request("https://phaseo.app/"), { params: Promise.resolve({ locale: "es-ES", feature }) });
		expect(response.status).toBe(404);
	});
	it("rejects unsupported locales", async () => {
		const response = await GET(new Request("https://phaseo.app/"), { params: Promise.resolve({ locale: "invalid", feature: "actionDock" }) });
		expect(response.status).toBe(404);
	});
	it("returns only optional tool copy with public caching", async () => {
		const response = await GET(new Request("https://phaseo.app/"), { params: Promise.resolve({ locale: "es-ES", feature: "actionDock" }) });
		const messages = await response.json();
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");
		expect(messages.Common.ui.modelEditor).toBeDefined();
		expect(messages.SettingsUI.identity.availability.ready).toBeTruthy();
		expect(messages.Site).toBeUndefined();
		expect(messages.Auth).toBeUndefined();
		expect(messages.Common.search).toBeUndefined();
	});
});
