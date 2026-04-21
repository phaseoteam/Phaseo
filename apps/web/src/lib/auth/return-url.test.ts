import { sanitizeReturnUrl } from "./return-url";

describe("sanitizeReturnUrl", () => {
	it("accepts normal internal paths", () => {
		expect(sanitizeReturnUrl("/settings/credits", "/")).toBe("/settings/credits");
	});

	it("accepts URL-encoded internal paths", () => {
		expect(sanitizeReturnUrl("%2Fsettings%2Fcredits", "/")).toBe("/settings/credits");
	});

	it("rejects encoded auth paths", () => {
		expect(sanitizeReturnUrl("%2Fsign-in%3Ffoo%3Dbar", "/")).toBe("/");
	});

	it("rejects protocol-relative redirects", () => {
		expect(sanitizeReturnUrl("%2F%2Fevil.example.com", "/")).toBe("/");
	});
});

