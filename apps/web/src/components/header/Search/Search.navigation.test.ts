import { describe, it, expect } from "vitest";
import { DEFAULT_SEARCH_CAPABILITIES, getGlobalNavigationItems, GLOBAL_NAVIGATION_ITEMS, isSearchDestinationEnabled } from "@/components/header/Search/Search.navigation";
import { getSettingsSidebar } from "@/components/(gateway)/settings/Sidebar.config";
import { GLOBAL_ACTION_ITEMS } from "@/components/header/Search/Search.commands";
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
		expect(disabled).not.toContain("/settings/classifiers");
		expect(isSearchDestinationEnabled("/settings/classifiers/new", DEFAULT_SEARCH_CAPABILITIES)).toBe(false);
		expect(getGlobalNavigationItems({ ...DEFAULT_SEARCH_CAPABILITIES, classifiers: true }).map((item) => item.href)).toContain("/settings/classifiers");
		// The palette filters its actions the same way, so "Create a classifier" is hidden too.
		const createClassifier = GLOBAL_ACTION_ITEMS.find((item) => item.id === "action-create-classifier");
		expect(isSearchDestinationEnabled(createClassifier?.href, DEFAULT_SEARCH_CAPABILITIES)).toBe(false);
		expect(isSearchDestinationEnabled(createClassifier?.href, { ...DEFAULT_SEARCH_CAPABILITIES, classifiers: true })).toBe(true);
		expect(disabled).not.toContain("/settings/slack");
		expect(isSearchDestinationEnabled("/settings/slack?installed=1", DEFAULT_SEARCH_CAPABILITIES)).toBe(false);
		expect(getGlobalNavigationItems({ ...DEFAULT_SEARCH_CAPABILITIES, slackAgent: true }).map((item) => item.href)).toContain("/settings/slack");
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
		const hrefs = new Set(GLOBAL_NAVIGATION_ITEMS.map((item) => item.href));
		const root = path.join(process.cwd(), "src/routes/{-$locale}/_dashboard");
		const routes = fs.readdirSync(root, { recursive: true, encoding: "utf8" });
		for (const file of routes) {
			const normalized = file.replaceAll("\\", "/");
			if ((normalized !== "index.tsx" && !normalized.endsWith("/index.tsx")) || normalized.includes("$") || normalized.startsWith("internal/") || normalized.startsWith("settings/internal/")) continue;
			const source = fs.readFileSync(path.join(root, file), "utf8");
			if (/\b(?:redirect|permanentRedirect|redirectBeforeLoad)\(/.test(source)) continue;
			// These redirect from helpers their route calls (onboarding.functions.ts, link.functions.ts).
			if (normalized === "onboarding/index.tsx" || normalized === "slack/link/index.tsx") continue;
			// Pathless segments such as `_list` are not part of the URL.
			const route = normalized === "index.tsx" ? "" : normalized.slice(0, -"/index.tsx".length).split("/").filter((segment) => !segment.startsWith("_")).join("/");
			const href = `/${route}`;
			expect(hrefs).toContain(href);
		}
	});
	it("has translated labels for every navigation destination", () => {
		for (const locale of ["en-GB", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"]) {
			const file = path.join(process.cwd(), "messages", locale, "common.json");
			const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
			for (const item of GLOBAL_NAVIGATION_ITEMS) {
				const label = catalog.search.palette.navigationItems[item.id];
				expect(label).toEqual(expect.any(String));
				expect(label.trim()).not.toBe("");
			}
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
