import { sanitizeReturnUrl } from "./return-url";

describe("sanitizeReturnUrl", () => {
	it("accepts normal internal paths", () => {
		expect(sanitizeReturnUrl("/settings/credits", "/")).toBe("/settings/credits");
	});
	it("preserves encoded key names through repeated auth sanitization", () => {
		const path = "/settings/keys/OAuth%3A%20https%3A%2F%2Fchatgpt.com%2Foauth%2Fclient.json?workspaceId=workspace&prefix=38eUe1";
		expect(sanitizeReturnUrl(path)).toBe(path);
		expect(sanitizeReturnUrl(sanitizeReturnUrl(path))).toBe(path);
		expect(sanitizeReturnUrl(encodeURIComponent(path))).toBe(path);
	});
	it.each(["/%2Fevil.example.com", "/%5Cevil.example.com", "/%0Asettings", "/%73ign-in", "/de-DE/%73ign-in"])("rejects unsafe encoded paths: %s", (path) => {
		expect(sanitizeReturnUrl(path)).toBe("/");
	});

	it("accepts URL-encoded internal paths", () => {
		expect(sanitizeReturnUrl("%2Fsettings%2Fcredits", "/")).toBe("/settings/credits");
	});

	it("rejects encoded auth paths", () => {
		expect(sanitizeReturnUrl("%2Fsign-in%3Ffoo%3Dbar", "/")).toBe("/");
	});

	it("rejects locale-prefixed auth loops", () => {
		expect(sanitizeReturnUrl("/de-DE/sign-in?returnUrl=%2Fsettings", "/")).toBe(
			"/",
		);
		expect(sanitizeReturnUrl("%2Far-SA%2Fsign-up", "/")).toBe("/");
	});

	it("rejects protocol-relative redirects", () => {
		expect(sanitizeReturnUrl("%2F%2Fevil.example.com", "/")).toBe("/");
	});
});
