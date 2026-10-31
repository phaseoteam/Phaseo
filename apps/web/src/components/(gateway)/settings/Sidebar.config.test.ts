import { describe, it, expect } from "vitest";
import { getActiveSettingsNav, getSettingsSidebar, isSettingsNavChildActive } from "./Sidebar.config";

describe("settings sidebar navigation", () => {
	it("removes the retired discovery queue while keeping provider review", () => {
		const hrefs = getSettingsSidebar({ showInternal: true }).flatMap((group) => group.items.map((item) => item.href));
		expect(hrefs).not.toContain("/settings/internal/model-discovery");
		expect(hrefs).toContain("/settings/internal/provider-review");
	});
	it("puts provider catalogs first without workspace or billing navigation", () => {
		const groups = getSettingsSidebar({ providerMode: true });
		expect(groups.map((group) => group.scope)).toEqual(["personal", "provider"]);
		expect(groups.flatMap((group) => group.items.map((item) => item.label))).toEqual(["Profile", "Account", "Your Models", "Provider Profile", "Integrations"]);
		expect(getActiveSettingsNav("/settings/provider/models", { providerMode: true })?.group.scope).toBe("provider");
		expect(getActiveSettingsNav("/settings/provider/review", { providerMode: true })?.item.label).toBe("Provider Profile");
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

	it("opens Classifiers for its list, new and edit pages", () => {
		for (const path of ["/settings/classifiers", "/settings/classifiers/new", "/settings/classifiers/00000000-0000-4000-8000-0000000000c1"]) {
			const active = getActiveSettingsNav(path, { showClassifiers: true });
			expect(active?.item.label).toBe("Classifiers");
			expect(active?.group.scope).toBe("workspace");
		}
		expect(getSettingsSidebar({ showClassifiers: true }).flatMap((group) => group.items).find((item) => item.href === "/settings/classifiers")?.badge).toBe("Beta");
		// Hidden until the workspace is in the beta gate.
		expect(getSettingsSidebar().flatMap((group) => group.items).some((item) => item.href === "/settings/classifiers")).toBe(false);
	});

	it("lists Budgets right after API keys in the workspace section", () => {
		const workspace = getSettingsSidebar().find((group) => group.scope === "workspace")!.items.map((item) => item.href);
		expect(workspace.indexOf("/settings/budgets")).toBe(workspace.indexOf("/settings/keys") + 1);
		expect(getActiveSettingsNav("/settings/budgets")?.item.label).toBe("Budgets");
	});

	it("shows Slack after Apps only behind the Slack agent flag", () => {
		const hrefs = (showSlackAgent: boolean) => getSettingsSidebar({ showSlackAgent }).flatMap((group) => group.items.map((item) => item.href));
		expect(hrefs(false)).not.toContain("/settings/slack");
		const shown = hrefs(true);
		expect(shown.indexOf("/settings/slack")).toBe(shown.indexOf("/settings/apps") + 1);
		const active = getActiveSettingsNav("/settings/slack", { showSlackAgent: true });
		expect(active?.item.label).toBe("Slack");
		expect(active?.item.badge).toBe("Beta");
		expect(active?.group.scope).toBe("workspace");
		expect(getActiveSettingsNav("/settings/slack")?.item.label).not.toBe("Slack");
	});

	it("includes the workspace activity log under settings", () => {
		const settings = getActiveSettingsNav("/settings/workspaces/activity")?.item;
		expect(settings?.label).toBe("Settings");
		expect(settings?.children?.map((child) => child.label)).toContain("Activity");
	});

	it("groups Key Security under API Keys", () => {
		const active = getActiveSettingsNav("/settings/security");
		expect(active?.item.label).toBe("API Keys");
		expect(active?.item.children?.find((child) => isSettingsNavChildActive("/settings/security", child))?.label).toBe("Key Security");
		expect(getActiveSettingsNav("/settings/keys/prod-key")?.item.children?.find((child) => isSettingsNavChildActive("/settings/keys/prod-key", child))?.label).toBe("Keys");
	});

	it("groups Trusted workloads under API Keys only when the beta is on", () => {
		const active = getActiveSettingsNav("/settings/trusted-workloads", { showWorkloadIdentity: true });
		expect(active?.item.label).toBe("API Keys");
		expect(active?.item.children?.map((child) => child.label)).toEqual(["Keys", "Key Security", "Trusted workloads"]);
		expect(active?.item.children?.find((child) => isSettingsNavChildActive("/settings/trusted-workloads", child))?.badge).toBe("Beta");
		const keys = (showWorkloadIdentity: boolean) => getSettingsSidebar({ showWorkloadIdentity }).flatMap((group) => group.items);
		expect(keys(true).some((item) => item.href === "/settings/trusted-workloads")).toBe(false);
		expect(keys(false).find((item) => item.href === "/settings/keys")?.children?.map((child) => child.label)).toEqual(["Keys", "Key Security"]);
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
		const workspaceGroups = getSettingsSidebar({ showClassifiers: true })
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
				"Budgets",
				"Usage",
				"Logs",
				"Routing",
				"Guardrails",
				"Rate limits",
				"Classifiers",
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
