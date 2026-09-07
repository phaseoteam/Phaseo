import { getSettingsSidebar } from "./Sidebar.config";
import { filterSettingsNavigation } from "./Sidebar.search";

describe("settings navigation search", () => {
	const groups = getSettingsSidebar({ showEnterprise: false, showAutoRouting: false });
	it("finds nested pages across scopes and retains their parent", () => {
		const results = filterSettingsNavigation(groups, "payment methods");
		expect(results[0].scope).toBe("personal");
		expect(results[0].items[0].children?.map((child) => child.href)).toEqual(["/settings/payment-methods"]);
		expect(filterSettingsNavigation(groups, "notifications")[0].scope).toBe("workspace");
	});
	it("keeps all children when their parent matches", () => {
		const result = filterSettingsNavigation(groups, "billing");
		expect(result[0].items[0].children).toHaveLength(3);
	});
	it("preserves feature visibility and handles empty searches", () => {
		expect(filterSettingsNavigation(groups, "SCIM")).toEqual([]);
		expect(filterSettingsNavigation(groups, "no such setting")).toEqual([]);
		expect(filterSettingsNavigation(groups, "  ")).toBe(groups);
	});
});
