import type { NavGroup } from "./Sidebar.config";

export function filterSettingsNavigation(groups: NavGroup[], query: string): NavGroup[] {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (!terms.length) return groups;
	const matches = (text: string) => terms.every((term) => text.toLowerCase().includes(term));
	return groups.map((group) => ({
		...group,
		items: group.items.flatMap((item) => {
			const text = `${group.scope === "personal" ? "Account" : "Workspace"} ${item.label} ${item.href}`;
			if (matches(text)) return [item];
			const children = item.children?.filter((child) => matches(`${text} ${child.label} ${child.href}`));
			return children?.length ? [{ ...item, children }] : [];
		}),
	})).filter((group) => group.items.length > 0);
}
