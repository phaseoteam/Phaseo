import { describe, expect, it } from "vitest";
import { browserNavigationAddress, browserRecents } from "./browserHistory";
describe("browser addresses and recents", () => {
	it.each([["example.com", "https://example.com/"], ["localhost:4100/path", "http://localhost:4100/path"], ["127.0.0.1:3000", "http://127.0.0.1:3000/"], ["[::1]:3000", "http://[::1]:3000/"], ["example.com:443", "https://example.com/"], ["https://example.com/a?q=x", "https://example.com/a?q=x"], ["hello world", "https://www.google.com/search?q=hello%20world"], ["Résumé 😀", "https://www.google.com/search?q=R%C3%A9sum%C3%A9%20%F0%9F%98%80"]])("navigates %s", (input, output) => expect(browserNavigationAddress(input)).toBe(output));
	it.each(["", " ", "javascript:alert(1)", "file:///owned", "https://user:secret@example.com", "x".repeat(8193)])("rejects unsafe or empty addresses", value => expect(() => browserNavigationAddress(value)).toThrow());
	it("bounds and validates stored recents without trusting persisted URLs", () => {
		const recent = { url: "https://example.com", title: "Owned", at: 1 };
		expect(browserRecents([null, recent, recent, { ...recent, url: "javascript:alert(1)" }, { ...recent, at: Infinity }])).toEqual([{ ...recent, url: "https://example.com/" }]);
		expect(browserRecents(Array.from({ length: 120 }, (_, at) => ({ ...recent, url: `https://example.com/${at}`, at })))).toHaveLength(100);
	});
});
