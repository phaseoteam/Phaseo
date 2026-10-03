import type { AbstractIntlMessages } from "next-intl";

// Shared chrome, error boundaries and reusable controls remain available on
// every route. Feature dictionaries are supplied by their route boundaries.
export const SHELL_MESSAGE_NAMESPACES = [
	"Auth.shared.changeLanguage", "Common.nav", "Common.footer.about", "Common.footer.or", "Common.search",
	"Common.theme", "Common.status", "Common.accessibility", "Common.errors",
	"Common.dropdown", "Common.timeRange",
	"Common.ui.accessibility.breadcrumb", "Common.ui.accessibility.breadcrumbMore",
	"Common.ui.accessibility.pagination", "Common.ui.accessibility.morePages",
	"Common.ui.accessibility.previous", "Common.ui.accessibility.next",
	"Common.ui.accessibility.previousPage", "Common.ui.accessibility.nextPage",
	"Common.ui.accessibility.toggleSidebar", "Common.ui.accessibility.sidebarTitle",
	"Common.ui.accessibility.mobileSidebarDescription", "Common.ui.accessibility.loading",
	"Common.ui.accessibility.saturationBrightness", "Common.ui.accessibility.hue",
	"Common.ui.accessibility.colorValueFormat", "Common.ui.accessibility.selectedColorHex",
	"Common.ui.accessibility.colorSaturationBrightness", "Common.ui.accessibility.selectCountry",
	"Common.ui.accessibility.searchCountry", "Common.ui.accessibility.countryNotFound",
	"Common.ui.accessibility.customAccentHexColor", "Common.ui.accessibility.chooseCustomAccentColor",
	"Common.ui.accessibility.searchTimezones", "Common.ui.accessibility.searchModels", "Common.ui.accessibility.mediaSettings",
	"Common.ui.accessibility.scrollToTop",
	"Common.ui.actionDockCopy.turnOnDock", "Common.ui.workspaceSwitcher", "Common.ui.theme",
	"Common.ui.localisationGaps", "Common.ui.externalLinkDialog", "Common.ui.feedbackPrompt", "Site.brandMenu",
	"SettingsUI.searchableSelectCopy",
	"Product.feedback",
	"SettingsUI.settingsCopy.settingsSidebar",
] as const;

export function selectMessages(
	messages: Record<string, unknown>,
	namespaces: readonly string[],
): AbstractIntlMessages {
	const selected: Record<string, unknown> = {};
	for (const namespace of namespaces) {
		if (namespaces.some((parent) => namespace.startsWith(`${parent}.`))) continue;
		const path = namespace.split(".");
		let source: unknown = messages;
		for (const part of path) {
			if (!source || typeof source !== "object" || Array.isArray(source) || !(part in source)) {
				throw new Error(`Missing translation namespace: ${namespace}`);
			}
			source = (source as Record<string, unknown>)[part];
		}
		let target = selected;
		for (const part of path.slice(0, -1)) {
			target[part] ??= {};
			target = target[part] as Record<string, unknown>;
		}
		target[path[path.length - 1]!] = source;
	}
	// Source catalogs also contain raw metadata lists. Preserve those when a
	// feature uses t.raw; next-intl's generic message type only describes text.
	return selected as AbstractIntlMessages;
}

/** Nested providers inherit shared copy without sending it through RSC again. */
export function combineMessages(
	parent: Record<string, unknown>,
	feature: AbstractIntlMessages,
): AbstractIntlMessages {
	const result = { ...parent };
	for (const [key, value] of Object.entries(feature)) {
		const previous = parent[key];
		result[key] = previous && typeof previous === "object" && !Array.isArray(previous) && typeof value === "object" && !Array.isArray(value)
			? combineMessages(previous as Record<string, unknown>, value)
			: value;
	}
	return result as AbstractIntlMessages;
}
