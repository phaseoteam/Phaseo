import { getActiveSettingsNav, getSettingsSidebar, isSettingsNavChildActive } from "./Sidebar.config";

describe("settings sidebar navigation", () => {
	it("puts provider catalogs first without workspace or billing navigation", () => {
		const groups = getSettingsSidebar({ providerMode: true });
		expect(groups.map((group) => group.scope)).toEqual(["personal", "provider"]);
		expect(groups.flatMap((group) => group.items.map((item) => item.label))).toEqual(["Profile", "Account", "Your Models", "Provider Review", "Integrations"]);
		expect(getActiveSettingsNav("/settings/provider/models", { providerMode: true })?.group.scope).toBe("provider");
		expect(getActiveSettingsNav("/settings/provider/review", { providerMode: true })?.item.label).toBe("Provider Review");
		expect(groups.flatMap((group) => group.items).some((item) => item.children?.some((child) => child.href === "/settings/account/providers"))).toBe(false);
	});
	it("keeps personal settings focused on the account", () => {
		const personalLabels = getSettingsSidebar()
			.filter((group) => group.scope === "personal")
			.flatMap((group) => group.items.map((item) => item.label));

		expect(personalLabels).toEqual([
			"Profile",
			"Account",
			"Workspaces",
			"Preferences",
			"Billing",
			"Feature Preview",
		]);
	});

	it("separates workspace usage from request logs", () => {
		expect(getActiveSettingsNav("/settings/usage")?.item.label).toBe("Usage");
		expect(getActiveSettingsNav("/settings/usage/overview")?.item.label).toBe("Usage");
		expect(getActiveSettingsNav("/settings/usage/logs")?.item.label).toBe("Logs");
		expect(getActiveSettingsNav("/settings/usage/logs/request-1")?.item.label).toBe("Logs");
		expect(getActiveSettingsNav("/settings/usage/logs/videos")?.item.label).toBe("Logs");
		expect(getActiveSettingsNav("/settings/usage/logs/batches")?.item.label).toBe("Logs");
	});

	it("includes the workspace activity log under settings", () => {
		const settings = getActiveSettingsNav("/settings/workspaces/activity")?.item;
		expect(settings?.label).toBe("Settings");
		expect(settings?.children?.map((child) => child.label)).toContain("Activity");
	});

	it("exposes Auto Routing within the Routing section", () => {
		const active = getActiveSettingsNav("/settings/routing/auto", { showAutoRouting: true });
		expect(active?.item.label).toBe("Routing");
		expect(active?.item.children?.find((child) => isSettingsNavChildActive("/settings/routing/auto", child))?.label).toBe("Auto routing");
		expect(getSettingsSidebar({ showAutoRouting: false })
			.flatMap((group) => group.items)
			.find((item) => item.href === "/settings/routing")
			?.children?.some((child) => child.href === "/settings/routing/auto"))
			.toBe(false);
	});

	it("orders workspace settings by task", () => {
		const workspaceGroups = getSettingsSidebar()
			.filter((group) => group.scope === "workspace")
			.map((group) => ({
				heading: group.heading,
				items: group.items.map((item) => item.label),
			}));

		expect(workspaceGroups).toEqual([{
			heading: undefined,
			items: [
				"Settings",
				"Enterprise",
				"API Keys",
				"Usage",
				"Logs",
				"Routing",
				"Guardrails",
				"Privacy",
				"Presets",
				"Private Models",
				"Bring Your Own Key",
				"Apps",
				"Management Keys",
				"Broadcast",
				"OAuth Apps",
				"Webhooks",
			],
		}]);
	});

	it("shows provider review only to internal users", () => {
		const labels = (showInternal: boolean) => getSettingsSidebar({ showInternal }).flatMap((group) => group.items.map((item) => item.label));
		expect(labels(false)).not.toContain("Provider review");
		expect(labels(true)).toContain("Provider review");
	});
});
