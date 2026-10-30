import { safelyDecodePathSegments } from "./safePathname";

describe("safelyDecodePathSegments", () => {
	it("decodes valid catalogue path segments", () => {
		expect(safelyDecodePathSegments(["openai", "gpt-5.6-sol"])).toBe("openai/gpt-5.6-sol");
	});

	it.each([["%ZZ", "missing"], ["%E0%A4%A", "missing"]])(
		"returns a safe fallback for malformed encoding",
		(...segments) => {
			expect(safelyDecodePathSegments(segments)).toBeNull();
		},
	);
});
