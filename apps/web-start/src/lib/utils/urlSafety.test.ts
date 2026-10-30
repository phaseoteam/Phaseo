import { normalizeHttpUrl, normalizePlaygroundMediaUrl } from "./urlSafety";

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

describe("normalizePlaygroundMediaUrl", () => {
	it("accepts safe image data urls when enabled", () => {
		expect(
			normalizePlaygroundMediaUrl(
				"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
				{ allowImageData: true },
			),
		).toBe("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA");
	});

	it("rejects unsafe schemes and svg data urls", () => {
		expect(
			normalizePlaygroundMediaUrl("javascript:alert(1)", {
				allowImageData: true,
			}),
		).toBeNull();
		expect(
			normalizePlaygroundMediaUrl(
				"data:text/html,<svg/onload=alert(1)>",
				{ allowImageData: true },
			),
		).toBeNull();
		expect(
			normalizePlaygroundMediaUrl(
				"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
				{ allowImageData: true },
			),
		).toBeNull();
		expect(
			normalizePlaygroundMediaUrl("file:///etc/passwd", {
				allowImageData: true,
			}),
		).toBeNull();
	});
});
