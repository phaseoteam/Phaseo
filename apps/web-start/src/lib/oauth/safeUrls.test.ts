import { isSafeOAuthRedirectUrl } from "./safeUrls";

describe("isSafeOAuthRedirectUrl", () => {
	it("accepts HTTPS and loopback HTTP redirects", () => {
		expect(isSafeOAuthRedirectUrl("https://client.example/callback")).toBe(true);
		expect(isSafeOAuthRedirectUrl("http://127.0.0.1:8976/callback")).toBe(true);
		expect(isSafeOAuthRedirectUrl("http://[::1]:8976/callback")).toBe(true);
	});

	it("rejects public HTTP, credentials, fragments, and invalid URLs", () => {
		expect(isSafeOAuthRedirectUrl("http://client.example/callback")).toBe(false);
		expect(isSafeOAuthRedirectUrl("https://user:pass@client.example/callback")).toBe(false);
		expect(isSafeOAuthRedirectUrl("https://client.example/callback#fragment")).toBe(false);
		expect(isSafeOAuthRedirectUrl("not a URL")).toBe(false);
	});
});
