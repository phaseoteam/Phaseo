import { GLOBAL_NAVIGATION_ITEMS } from "./Search.navigation";
import { getSettingsSidebar } from "@/components/(gateway)/settings/Sidebar.config";
import fs from "node:fs";
import path from "node:path";

describe("global search navigation", () => {
	it("covers public static pages in the dashboard", () => {
		const root = path.join(process.cwd(), "src/app/(dashboard)");
		const hrefs = new Set(GLOBAL_NAVIGATION_ITEMS.map((item) => item.href));
		const pages = fs.readdirSync(root, { recursive: true, encoding: "utf8" });
		for (const file of pages) {
			const normalized = file.replaceAll("\\", "/");
			if (!normalized.endsWith("/page.tsx") || normalized.includes("[") || normalized.startsWith("internal/") || normalized.startsWith("settings/internal/")) continue;
			const source = fs.readFileSync(path.join(root, file), "utf8");
			if (/\b(?:redirect|permanentRedirect)\(/.test(source)) continue;
			expect(hrefs).toContain(`/${normalized.slice(0, -"/page.tsx".length)}`);
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
