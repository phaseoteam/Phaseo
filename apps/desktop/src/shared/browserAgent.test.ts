import { describe, expect, it } from "vitest";
import { browserViewportPresets } from "./browser";
import { browserAgentDefaults, browserAgentSelector, browserAgentUrl, browserTabOfChat, validateBrowserAct, validateBrowserAppearance, validateBrowserClose, validateBrowserDialog, validateBrowserEvaluate, validateBrowserOpen, validateBrowserResize, validateBrowserSnapshot, validateBrowserTab, validateBrowserTarget, validateBrowserType, validateBrowserWait } from "./browserAgent";

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

describe("agent browser actions", () => {
	it("checks each action's own fields", () => {
		expect(validateBrowserAct({ action: "hover", selector: "#menu" })).toEqual({ action: "hover", selector: "#menu", timeoutMs: browserAgentDefaults.timeoutMs });
		expect(() => validateBrowserAct({ action: "hover" })).toThrow("hover needs selector.");
		expect(() => validateBrowserAct({ action: "click", selector: "a" })).toThrow(/Invalid action/);
		expect(validateBrowserAct({ action: "select", selector: "select", values: ["Red"] })).toMatchObject({ values: ["Red"] });
		expect(validateBrowserAct({ action: "press", key: "Enter", modifiers: ["Control"] })).toMatchObject({ key: "Enter", modifiers: ["Control"] });
		expect(validateBrowserAct({ action: "press", key: "é" })).toMatchObject({ key: "é" });
		for (const key of ["Enterr", "ab", "", "\n"]) expect(() => validateBrowserAct({ action: "press", key })).toThrow(/Invalid key/);
		expect(() => validateBrowserAct({ action: "press", key: "a", modifiers: ["Hyper"] })).toThrow(/Invalid modifiers/);
		expect(validateBrowserAct({ action: "scroll", deltaY: 120.4 })).toMatchObject({ deltaX: 0, deltaY: 120 });
		expect(() => validateBrowserAct({ action: "scroll" })).toThrow("scroll needs deltaX or deltaY.");
		expect(() => validateBrowserAct({ action: "scroll", deltaY: Number.POSITIVE_INFINITY })).toThrow("Invalid deltaY.");
		expect(() => validateBrowserAct({ action: "drag", selector: "#a" })).toThrow("Invalid selector.");
		expect(() => validateBrowserAct({ action: "upload", selector: "input", paths: [] })).toThrow("upload needs paths.");
		expect(() => validateBrowserAct({ action: "upload", selector: "input", paths: Array(21).fill("C:/a") })).toThrow("Invalid paths.");
	});
	it("waits for at least one condition", () => {
		expect(validateBrowserWait({ selector: ".spinner", state: "hidden" })).toEqual({ selector: ".spinner", state: "hidden", timeoutMs: browserAgentDefaults.timeoutMs });
		expect(() => validateBrowserWait({})).toThrow("Pass selector, text or url to wait for.");
		expect(() => validateBrowserWait({ text: "x", state: "gone" })).toThrow(/Invalid state/);
	});
	it("bounds scripts, sizes, appearance, dialogs and closing", () => {
		expect(() => validateBrowserEvaluate({ expression: "  " })).toThrow(/Invalid expression/);
		expect(() => validateBrowserEvaluate({ expression: "x".repeat(browserAgentDefaults.expressionLength + 1) })).toThrow(/Invalid expression/);
		expect(validateBrowserResize({ mode: "fill" })).toEqual({ viewport: { mode: "fill" } });
		expect(validateBrowserResize({ mode: "freeform", width: 800, height: 600 }).viewport).toMatchObject({ mode: "device", width: 800, height: 600 });
		const preset = browserViewportPresets[0];
		expect(validateBrowserResize({ mode: "preset", preset: preset.id, orientation: "landscape" }).viewport).toEqual({ mode: "device", width: preset.height, height: preset.width, preset: preset.id });
		expect(() => validateBrowserResize({ mode: "preset", preset: "toaster" })).toThrow(/Invalid preset/);
		expect(() => validateBrowserResize({ mode: "huge" })).toThrow(/Invalid mode/);
		expect(validateBrowserAppearance({ colorScheme: "dark" })).toEqual({ colorScheme: "dark" });
		expect(validateBrowserDialog({ action: "accept", promptText: "Ada" })).toEqual({ action: "accept", promptText: "Ada" });
		expect(() => validateBrowserDialog({ action: "ok" })).toThrow(/Invalid action/);
		expect(() => validateBrowserClose({})).toThrow("Pass the tabId to close.");
	});
});
