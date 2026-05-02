import { normalizeHttpUrl } from "./urlSafety";

describe("normalizeHttpUrl", () => {
	it("accepts and normalizes https urls", () => {
		expect(normalizeHttpUrl(" https://example.com/path ")).toBe("https://example.com/path");
	});

	it("accepts http urls", () => {
		expect(normalizeHttpUrl("http://example.com")).toBe("http://example.com/");
	});

	it("rejects javascript and data schemes", () => {
		expect(normalizeHttpUrl("javascript:alert(1)")).toBeNull();
		expect(normalizeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
	});

	it("rejects invalid or empty input", () => {
		expect(normalizeHttpUrl("")).toBeNull();
		expect(normalizeHttpUrl("   ")).toBeNull();
		expect(normalizeHttpUrl("not a url")).toBeNull();
		expect(normalizeHttpUrl(null)).toBeNull();
	});
});
