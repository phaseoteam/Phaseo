import { DEFAULT_SEARCH_CAPABILITIES, getGlobalNavigationItems, GLOBAL_NAVIGATION_ITEMS, isSearchDestinationEnabled } from "@/components/header/Search/Search.navigation";
import { getSettingsSidebar } from "@/components/(gateway)/settings/Sidebar.config";
import fs from "node:fs";
import path from "node:path";

describe("global search navigation", () => {
	it("hides gated destinations until their evaluated capabilities allow them", () => {
		const disabled = getGlobalNavigationItems(DEFAULT_SEARCH_CAPABILITIES).map((item) => item.href);
		expect(disabled).not.toContain("/settings/routing/auto");
		expect(disabled).not.toContain("/settings/workspaces/enterprise/sso");
		expect(disabled).not.toContain("/settings/webhooks/new");
		expect(disabled).not.toContain("/chat/video");
		expect(disabled).not.toContain("/games");
		expect(disabled).toContain("/settings/routing");
		const enabled = getGlobalNavigationItems({ ...DEFAULT_SEARCH_CAPABILITIES, autoRouting: true });
		expect(enabled.map((item) => item.href)).toContain("/settings/routing/auto");
		expect(enabled.map((item) => item.href)).not.toContain("/settings/workspaces/enterprise");
	});

	it("also filters stored destinations with query strings or nested paths", () => {
		expect(isSearchDestinationEnabled("/settings/routing/auto?tab=models", DEFAULT_SEARCH_CAPABILITIES)).toBe(false);
		expect(isSearchDestinationEnabled("/settings/workspaces/enterprise/sso", DEFAULT_SEARCH_CAPABILITIES)).toBe(false);
		expect(isSearchDestinationEnabled("/settings/routing/automatic", DEFAULT_SEARCH_CAPABILITIES)).toBe(true);
		expect(isSearchDestinationEnabled(undefined, DEFAULT_SEARCH_CAPABILITIES)).toBe(true);
	});
	it("covers public static pages in the dashboard", () => {
		const root = path.join(process.cwd(), "src/app/(dashboard)");
		const hrefs = new Set(GLOBAL_NAVIGATION_ITEMS.map((item) => item.href));
		const pages = fs.readdirSync(root, { recursive: true, encoding: "utf8" });
		for (const file of pages) {
			const normalized = file.replaceAll("\\", "/");
			if ((normalized !== "page.tsx" && !normalized.endsWith("/page.tsx")) || normalized.includes("[") || normalized.startsWith("internal/") || normalized.startsWith("settings/internal/")) continue;
			const source = fs.readFileSync(path.join(root, file), "utf8");
			if (/\b(?:redirect|permanentRedirect)\(/.test(source)) continue;
			const href = normalized === "page.tsx" ? "/" : `/${normalized.slice(0, -"/page.tsx".length)}`;
			expect(hrefs).toContain(href);
		}
	});
	it("includes every public settings sidebar destination", () => {
		const hrefs = new Set(GLOBAL_NAVIGATION_ITEMS.map((item) => item.href));
		for (const group of getSettingsSidebar({ showAutoRouting: true })) {
			for (const item of group.items) {
				expect(hrefs.has(item.href)).toBe(true);
				for (const child of item.children ?? []) expect(hrefs.has(child.href)).toBe(true);
			}
		}
	});
	it("contains unique, local destinations", () => {
		const ids = GLOBAL_NAVIGATION_ITEMS.map((item) => item.id);
		const hrefs = GLOBAL_NAVIGATION_ITEMS.map((item) => item.href);
		expect(new Set(ids).size).toBe(ids.length);
		expect(new Set(hrefs).size).toBe(hrefs.length);
		expect(hrefs.every((href) => href.startsWith("/"))).toBe(true);
	});

	it("exposes the primary catalogue and account destinations", () => {
		expect(GLOBAL_NAVIGATION_ITEMS).toEqual(expect.arrayContaining([
			expect.objectContaining({ title: "Models", href: "/models" }),
			expect.objectContaining({ title: "API Providers", href: "/api-providers" }),
			expect.objectContaining({ title: "Settings", href: "/settings" }),
			expect.objectContaining({ title: "API Keys", href: "/settings/keys" }),
		]));
	});
});
