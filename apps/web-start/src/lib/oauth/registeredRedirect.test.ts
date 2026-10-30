import { isRegisteredOAuthRedirectAllowed } from "./registeredRedirect";

const desktop = { client_id: "phaseo_desktop", is_first_party: true, registration_source: "first_party", redirect_uris: ["http://127.0.0.1/callback"] };

describe("registered desktop consent callbacks", () => {
	it.each(["http://127.0.0.1:30397/callback", "http://127.0.0.1:65432/callback"])("accepts the registered native callback with a temporary port: %s", redirect => {
		expect(isRegisteredOAuthRedirectAllowed(desktop, redirect)).toBe(true);
	});
	it.each(["http://localhost:30397/callback", "https://127.0.0.1:30397/callback", "http://127.0.0.1:30397/other", "http://user@127.0.0.1:30397/callback", "http://127.0.0.1:30397/callback?extra=1", "http://127.0.0.1:30397/callback#extra", "https://example.com/callback", "invalid"])("rejects invalid native callbacks: %s", redirect => {
		expect(isRegisteredOAuthRedirectAllowed(desktop, redirect)).toBe(false);
	});
	it.each([{ client_id: "third-party" }, { is_first_party: false }, { registration_source: "dynamic" }, { redirect_uris: [] }])("does not extend untrusted or unregistered metadata: %j", override => {
		expect(isRegisteredOAuthRedirectAllowed({ ...desktop, ...override }, "http://127.0.0.1:30397/callback")).toBe(false);
	});
	it("retains exact registered URLs for other applications", () => {
		const app = { client_id: "other", redirect_uris: ["https://client.example/callback"] };
		expect(isRegisteredOAuthRedirectAllowed(app, "https://client.example/callback")).toBe(true);
		expect(isRegisteredOAuthRedirectAllowed(app, "https://client.example/other")).toBe(false);
	});
});
