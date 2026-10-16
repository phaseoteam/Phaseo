import { describe, expect, it } from "vitest";
import { browserAgentDefaults, browserAgentSelector, browserAgentUrl, browserTabOfChat, validateBrowserOpen, validateBrowserSnapshot, validateBrowserTab, validateBrowserTarget, validateBrowserType } from "./browserAgent";

describe("agent browser tools", () => {
	it("opens only web addresses: never files, app pages, scripts or embedded credentials", () => {
		expect(browserAgentUrl(" http://localhost:5173/ ")).toBe("http://localhost:5173/");
		expect(browserAgentUrl("https://example.com/a?b=c")).toBe("https://example.com/a?b=c");
		for (const bad of ["file:///C:/Windows/win.ini", "javascript:alert(1)", "chrome://settings", "devtools://devtools/x", "data:text/html,hi", "about:blank", "https://user:pass@example.com/", "not a url", "", 7]) expect(() => browserAgentUrl(bad)).toThrow(/Invalid url/);
	});
	it("confines tabs to the chat that owns them", () => {
		expect(browserTabOfChat("chat", "chat")).toBe(true);
		expect(browserTabOfChat("chat:1234", "chat")).toBe(true);
		expect(browserTabOfChat("chat2", "chat")).toBe(false);
		expect(browserTabOfChat("other:chat", "chat")).toBe(false);
		expect(browserTabOfChat("draft", "")).toBe(false);
	});
	it("checks selectors and text before they reach a page", () => {
		expect(browserAgentSelector("  #search > input  ")).toBe("#search > input");
		for (const bad of ["", "   ", "a\nb", "a\u0000", "a\u007f", "x".repeat(browserAgentDefaults.selectorLength + 1), 5, null]) expect(() => browserAgentSelector(bad)).toThrow("Invalid selector.");
		expect(validateBrowserType({ selector: "input", text: "hello", submit: true })).toEqual({ selector: "input", text: "hello", clear: false, submit: true, timeoutMs: browserAgentDefaults.timeoutMs });
		expect(() => validateBrowserType({ selector: "input", text: "x".repeat(browserAgentDefaults.textLength + 1) })).toThrow(/Invalid text/);
		expect(() => validateBrowserType({ selector: "input", text: 4 })).toThrow(/Invalid text/);
		expect(() => validateBrowserType({ selector: "input", text: "a", clear: "yes" })).toThrow("Invalid clear.");
	});
	it("validates tab ids, timeouts and snapshot sizes", () => {
		expect(validateBrowserOpen({ url: "https://a.test/", newTab: true, timeoutMs: 0 })).toEqual({ url: "https://a.test/", newTab: true, timeoutMs: 0 });
		expect(() => validateBrowserOpen({ url: "https://a.test/", newTab: true, tabId: "chat" })).toThrow("Pass tabId or newTab, not both.");
		expect(() => validateBrowserOpen({ url: "https://a.test/", timeoutMs: 60_001 })).toThrow(/timeoutMs/);
		expect(() => validateBrowserTarget({ selector: "a", tabId: "chat\n" })).toThrow("Invalid tabId.");
		expect(validateBrowserTab(undefined)).toEqual({});
		expect(validateBrowserTab({ tabId: "chat:1" })).toEqual({ tabId: "chat:1" });
		expect(validateBrowserSnapshot({})).toEqual({ maxCharacters: browserAgentDefaults.snapshotCharacters });
		expect(() => validateBrowserSnapshot({ maxCharacters: 10 })).toThrow(/maxCharacters/);
		expect(() => validateBrowserTarget([])).toThrow("Expected browser tool arguments.");
	});
});
