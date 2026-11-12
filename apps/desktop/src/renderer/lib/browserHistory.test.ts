import { describe, expect, it } from "vitest";
import { browserNavigationAddress, browserRecents, projectRecents, recordBrowserVisit } from "./browserHistory";

describe("browser addresses", () => {
	it.each([
		["example.com", "https://example.com/"], ["localhost:4100/path", "http://localhost:4100/path"], ["localhost", "http://localhost/"], ["127.0.0.1:3000", "http://127.0.0.1:3000/"], ["[::1]:3000", "http://[::1]:3000/"],
		["192.168.1.20:8080", "https://192.168.1.20:8080/"], ["devbox:8080/app", "https://devbox:8080/app"], ["example.com:443", "https://example.com/"], ["https://example.com/a?q=x", "https://example.com/a?q=x"], ["http://localhost:5173", "http://localhost:5173/"],
		["hello world", "https://duckduckgo.com/?q=hello%20world"], ["react", "https://duckduckgo.com/?q=react"], ["Résumé 😀", "https://duckduckgo.com/?q=R%C3%A9sum%C3%A9%20%F0%9F%98%80"],
	])("opens %s as %s", (input, output) => expect(browserNavigationAddress(input)).toBe(output));
	it.each(["", " ", "javascript:alert(1)", "file:///owned", "mailto:a@example.com", "https://user:secret@example.com", "x".repeat(8193)])("rejects unsafe or empty input %j", value => expect(() => browserNavigationAddress(value)).toThrow());
});

describe("browser recents", () => {
	const recent = { url: "https://example.com", title: "Owned", at: 1 };
	it("validates stored recents without trusting persisted URLs or icons", () => {
		expect(browserRecents([null, recent, recent, { ...recent, url: "javascript:alert(1)" }, { ...recent, at: Infinity }, { ...recent, url: "https://b.test", favicon: "javascript:x" }, { ...recent, url: "https://c.test", favicon: "https://c.test/icon.png" }]))
			.toEqual([{ ...recent, url: "https://example.com/" }, { ...recent, url: "https://b.test/" }, { ...recent, url: "https://c.test/", favicon: "https://c.test/icon.png" }]);
	});
	it("keeps fifty per project and the same page in different projects", () => {
		const values = [...Array.from({ length: 60 }, (_, at) => ({ ...recent, url: `https://example.com/${at}`, at, project: "a" })), { ...recent, project: "b" }, recent];
		const stored = browserRecents(values);
		expect(projectRecents(stored, "a")).toHaveLength(50); expect(projectRecents(stored, "b")).toHaveLength(1); expect(projectRecents(stored, "")).toHaveLength(1);
	});
	it("puts a visit first in its project and replaces the older visit", () => {
		const stored = [{ ...recent, url: "https://a.test/", project: "p" }, { ...recent, url: "https://b.test/", project: "p" }, { ...recent, url: "https://b.test/" }];
		const next = recordBrowserVisit(stored, { url: "https://b.test/", title: "New", at: 5, project: "p" });
		expect(projectRecents(next, "p").map(item => [item.url, item.title])).toEqual([["https://b.test/", "New"], ["https://a.test/", "Owned"]]);
		expect(projectRecents(next, "")).toHaveLength(1);
	});
});
