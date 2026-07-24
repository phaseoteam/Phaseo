import { describe, expect, it } from "vitest";
import { sanitizeUrlForLogging } from "./sanitizeUrl";

describe("sanitizeUrlForLogging", () => {
	it("redacts Google and generic query credentials", () => {
		const sanitized = sanitizeUrlForLogging(
			"https://generativelanguage.googleapis.com/v1/models/test?alt=sse&key=secret-value&access_token=oauth-secret",
		);
		expect(sanitized).toContain("alt=sse");
		expect(sanitized).toContain("key=%5Bredacted%5D");
		expect(sanitized).toContain("access_token=%5Bredacted%5D");
		expect(sanitized).not.toContain("secret-value");
		expect(sanitized).not.toContain("oauth-secret");
	});

	it("removes user info and fragments and rejects invalid URLs", () => {
		expect(sanitizeUrlForLogging("https://user:pass@example.com/path#secret"))
			.toBe("https://example.com/path");
		expect(sanitizeUrlForLogging("not a URL with secret=abc")).toBeNull();
	});
});
