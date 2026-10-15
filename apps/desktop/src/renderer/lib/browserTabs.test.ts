import { describe, expect, it } from "vitest";
import type { BrowserState } from "../../shared/browser";
import { browserTabLabel, browserTabs, browserViewportToRestore, openBrowserTab, updateBrowserTab } from "./browserTabs";

const fill = { mode: "fill" } as const;
const phone = { mode: "device", width: 390, height: 844, preset: "iphone-12-pro" } as const;
const state = (value: Partial<BrowserState> & { id: string }): BrowserState => ({ url: "", title: "", loading: false, canGoBack: false, canGoForward: false, devToolsOpen: false, configured: true, viewport: fill, zoom: 1, colorScheme: "system", audible: false, muted: false, ...value });

describe("chat browser tabs", () => {
	it("converts the earlier Desktop, Phone and Tablet previews and repairs invalid ones", () => {
		const group = browserTabs({ tabs: [{ id: "chat", viewport: "phone-landscape" }, { id: "chat:other", viewport: "bad" }, { id: "chat:tablet", viewport: "tablet" }, { id: "chat:new", viewport: phone }] }, "chat");
		expect(group.tabs.map(tab => tab.viewport)).toEqual([{ mode: "device", width: 844, height: 390, preset: "iphone-12-pro" }, fill, { mode: "device", width: 768, height: 1024, preset: "ipad-mini" }, phone]);
	});
	it("keeps zoom, colours and the person's name, dropping invalid ones", () => {
		const group = browserTabs({ tabs: [{ id: "chat", zoom: 1.5, colorScheme: "dark", name: "  Docs  " }, { id: "chat:2", zoom: 1.33, colorScheme: "sepia", name: " " }] }, "chat");
		expect(group.tabs[0]).toMatchObject({ zoom: 1.5, colorScheme: "dark", name: "Docs" });
		expect(group.tabs[1]).not.toHaveProperty("zoom"); expect(group.tabs[1]).not.toHaveProperty("colorScheme"); expect(group.tabs[1]).not.toHaveProperty("name");
	});
	it("routes foreground and background requests without altering the source tab", () => {
		const group = browserTabs({ tabs: [{ id: "chat", url: "" }] }, "chat");
		const request = { sourceId: "chat", url: "https://example.com/page", background: false };
		const foreground = openBrowserTab(group, request, "chat:new");
		expect(foreground.active).toBe("chat:new"); expect(foreground.tabs[0]).toEqual(group.tabs[0]); expect(foreground.tabs[1].url).toBe(request.url);
		expect(openBrowserTab(group, { ...request, background: true }, "chat:new").active).toBe("chat");
	});
	it("ignores requests belonging to another chat", () => { const group = browserTabs({ tabs: [{ id: "chat" }] }, "chat"); expect(openBrowserTab(group, { sourceId: "other", url: "https://example.com", background: false }, "chat:new")).toBe(group); });
	it("rejects unsafe popup targets and enforces the tab bound", () => {
		const group = browserTabs({ tabs: [{ id: "chat" }] }, "chat");
		expect(() => openBrowserTab(group, { sourceId: "chat", url: "file:///private", background: false }, "chat:new")).toThrow();
		const full = browserTabs({ active: "chat:0", tabs: Array.from({ length: 20 }, (_, i) => ({ id: "chat:" + i, url: "", title: "Tab" })) }, "chat");
		expect(() => openBrowserTab(full, { sourceId: "chat:0", url: "https://example.com", background: false }, "chat:new")).toThrow("Close a browser tab");
	});
	it.each([null, 1, [], {}, { tabs: null }])("treats malformed state %j as no tabs", value => expect(browserTabs(value, "chat")).toEqual({ active: "", tabs: [] }));
	it("rejects foreign and duplicate IDs, unsafe saved URLs and missing active tabs", () => {
		expect(browserTabs({ active: "missing", tabs: [{ id: "other", url: "https://example.com" }, { id: "chat", url: "file:///private", title: "Saved" }, { id: "chat", url: "https://example.com" }, { id: "chat:second", url: "https://example.com", title: "x".repeat(200) }] }, "chat"))
			.toEqual({ active: "chat", tabs: [{ id: "chat", url: "", title: "Saved", viewport: fill }, { id: "chat:second", url: "https://example.com/", title: "x".repeat(120), viewport: fill }] });
	});
	it("bounds persisted tabs and preserves valid active selection", () => { const tabs = Array.from({ length: 30 }, (_, index) => ({ id: "chat:" + index, title: "Tab", url: "" })); const group = browserTabs({ active: "chat:5", tabs }, "chat"); expect(group.tabs).toHaveLength(20); expect(group.active).toBe("chat:5"); });
	it("retains the last confirmed address while a native load has no committed URL", () => {
		const group = browserTabs({ active: "chat", tabs: [{ id: "chat", title: "Confirmed", url: "https://example.com/" }] }, "chat");
		expect(updateBrowserTab(group, state({ id: "chat", loading: true })).tabs[0]).toEqual(group.tabs[0]);
	});
	it("ignores a fresh native page that has not been given its saved address yet", () => {
		const group = browserTabs({ active: "chat", tabs: [{ id: "chat", title: "Saved", url: "https://example.com/", viewport: "phone" }] }, "chat");
		expect(updateBrowserTab(group, state({ id: "chat", configured: false })).tabs[0]).toEqual(group.tabs[0]);
	});
	it("updates the native source tab without changing selection or another tab", () => {
		const group = browserTabs({ active: "chat:second", tabs: [{ id: "chat", url: "", title: "First", name: "Mine" }, { id: "chat:second", url: "", title: "Second" }] }, "chat");
		const next = updateBrowserTab(group, state({ id: "chat", url: "https://example.com/", title: "Native", zoom: 1.25, colorScheme: "dark", viewport: phone }));
		expect(next.active).toBe("chat:second");
		expect(next.tabs[0]).toEqual({ id: "chat", title: "Native", url: "https://example.com/", viewport: phone, zoom: 1.25, colorScheme: "dark", name: "Mine" });
		expect(next.tabs[1]).toEqual(group.tabs[1]);
		expect(updateBrowserTab(next, state({ id: "chat", url: "https://example.com/", title: "Native" })).tabs[0]).toEqual({ id: "chat", title: "Native", url: "https://example.com/", viewport: fill, name: "Mine" });
	});
	it.each([[{ name: "Mine", title: "Page", url: "https://a.test/" }, "Mine"], [{ title: "Page", url: "https://a.test/" }, "Page"], [{ title: "", url: "http://localhost:5173/app" }, "localhost:5173"], [{ title: "", url: "" }, "Browser"]])("labels a pane tab %j as %s", (tab, label) => expect(browserTabLabel(tab)).toBe(label));
});

it.each([[true, { mode: "device", width: 1024, height: 768 }, phone, { mode: "device", width: 1024, height: 768 }], [true, fill, phone, fill], [false, fill, phone, phone]] as const)("restores viewport from authoritative native or fresh saved state", (configured, viewport, saved, expected) => {
	expect(browserViewportToRestore({ configured, viewport }, saved)).toEqual(expected);
});
