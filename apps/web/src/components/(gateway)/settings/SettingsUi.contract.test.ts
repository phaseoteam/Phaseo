import fs from "node:fs";
import path from "node:path";

const webRoot = process.cwd();

function readSource(relativePath: string): string {
	return fs.readFileSync(path.join(webRoot, relativePath), "utf8");
}

describe("settings UI contracts", () => {
	it("uses the sidebar as the single settings navigation hierarchy", () => {
		const layoutSource = readSource("src/app/(dashboard)/settings/layout.tsx");
		const sidebarSource = readSource(
			"src/components/(gateway)/settings/Sidebar.tsx",
		);
		const configSource = readSource(
			"src/components/(gateway)/settings/Sidebar.config.ts",
		);

		expect(layoutSource).toContain("<SettingsSidebar");
		expect(layoutSource).not.toContain("SettingsTopTabsClientOnly");
		expect(sidebarSource).toContain("<Collapsible");
		expect(sidebarSource).toContain("<CollapsibleTrigger asChild>");
		expect(sidebarSource).not.toContain("<SidebarMenuAction");
		expect(sidebarSource).toContain("<SidebarMenuSub");
		expect(sidebarSource).toContain('className="!rounded-lg"');
		expect(sidebarSource).toContain("isSettingsNavChildActive");
		expect(configSource).toContain("children?: NavChildItem[]");
		expect(configSource).toContain('label: "Transactions"');
		expect(configSource).toContain('label: "MFA"');
	});

	it("keeps the complete nested mobile settings navigation in a sheet", () => {
		const headerSource = readSource("src/components/header/header.tsx");
		const searchSource = readSource("src/components/header/Search/Search.tsx");
		const menuSource = readSource(
			"src/components/(gateway)/settings/SettingsSidebarTrigger.tsx",
		);
		const pageHeaderSource = readSource(
			"src/components/(gateway)/settings/SettingsPageHeader.tsx",
		);
		const keysPageSource = readSource("src/app/(dashboard)/settings/keys/page.tsx");

		expect(headerSource).toContain("<SettingsSidebarTrigger");
		expect(headerSource.indexOf("<SettingsSidebarTrigger")).toBeLessThan(
			headerSource.indexOf('aria-label="Phaseo home"'),
		);
		expect(headerSource.match(/<SearchWrapper/g)).toHaveLength(1);
		expect(headerSource.indexOf("<SearchWrapper")).toBeLessThan(
			headerSource.indexOf('<AuthControls variant="mobile"'),
		);
		expect(headerSource).toContain("mobileGhost");
		expect(headerSource).toContain('className="size-9');
		expect(searchSource).toContain("mobileGhost &&");
		expect(searchSource).toContain("border-transparent bg-transparent");
		expect(searchSource).toContain("lg:border-zinc-200/80");
		expect(menuSource).toContain("<Sheet");
		expect(menuSource).toContain('side="left"');
		expect(menuSource).toContain("<Collapsible");
		expect(menuSource).toContain("<CollapsibleTrigger asChild>");
		expect(menuSource).toContain("isSettingsNavChildActive");
		expect(menuSource).toContain('open={open}');
		expect(menuSource).toContain("scopeSelection");
		expect(menuSource).toContain("group.scope === visibleScope");
		expect(menuSource).toContain('selectScope("personal")');
		expect(menuSource).toContain('selectScope("workspace")');
		expect(menuSource).toContain("Close settings menu");
		expect(menuSource).toContain("Open settings menu");
		expect(menuSource).toContain("<MenuIcon");
		expect(menuSource).toContain("<X");
		expect(menuSource).not.toContain("uppercase");
		expect(menuSource).not.toContain("tracking-wide");
		expect(menuSource).toContain('className="flex items-center lg:hidden"');
		expect(menuSource).toContain("const Icon = item.icon");
		expect(menuSource).toContain("<Icon className=");
		expect(menuSource).toContain("Account");
		expect(menuSource).toContain("Workspace");
		expect(menuSource).toContain("visibleGroups.map");
		expect(pageHeaderSource).toContain('className={cn("space-y-4", className)}');
		expect(pageHeaderSource.indexOf("{actions ?")).toBeGreaterThan(
			pageHeaderSource.indexOf("{description ?"),
		);
		expect(keysPageSource).toContain("flex flex-wrap items-center gap-2");
	});

	it("provides display-label collections for ID-backed settings selects", () => {
		const expectedItemCollections: Record<string, string[]> = {
			"src/components/(gateway)/settings/account/AccountSettingsClient.tsx": [
				"items={teams.map",
			],
			"src/components/(gateway)/settings/routing/DynamicRoutesStudio.tsx": [
				"items={options}",
				"items={items}",
			],
			"src/components/(gateway)/settings/routing/RoutingSettingsClient.tsx": [
				"items={ROUTING_OPTIONS}",
				"items={RESPONSE_HEALING_OPTIONS}",
			],
			"src/components/(gateway)/usage/UsageHeader/UsageHeader.tsx": [
				"items={RANGE_ITEMS}",
			],
			"src/components/(gateway)/usage/UsageTableFilters.tsx": [
				"items={modelFilterItems}",
				"items={providerFilterItems}",
				"items={keyFilterItems}",
				"items={STATUS_FILTER_ITEMS}",
			],
		};

		for (const [relativePath, collections] of Object.entries(
			expectedItemCollections,
		)) {
			const source = readSource(relativePath);
			for (const collection of collections) {
				expect(source).toContain(collection);
			}
		}
	});
});

