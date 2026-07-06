export const APP_CATEGORY_OPTIONS = [
	{ value: "chat", label: "Chat" },
	{ value: "developer-tools", label: "Developer Tools" },
	{ value: "research", label: "Research" },
	{ value: "productivity", label: "Productivity" },
	{ value: "education", label: "Education" },
	{ value: "commerce", label: "Commerce" },
	{ value: "media", label: "Media" },
	{ value: "finance", label: "Finance" },
	{ value: "other", label: "Other" },
] as const;

export type AppCategory = (typeof APP_CATEGORY_OPTIONS)[number]["value"];
export const MAX_APP_CATEGORIES = 3;

export function getAppCategoryLabel(category: string | null | undefined) {
	return (
		APP_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ??
		null
	);
}

export function normalizeAppCategory(
	category: string | null | undefined
): AppCategory | null {
	if (!category) return null;
	const normalized = category.trim().toLowerCase();
	const match = APP_CATEGORY_OPTIONS.find(
		(option) => option.value === normalized
	);
	return match?.value ?? null;
}

export function parseAppCategories(
	categoryCsv: string | null | undefined
): AppCategory[] {
	if (!categoryCsv) return [];
	const seen = new Set<AppCategory>();
	const categories: AppCategory[] = [];

	for (const value of categoryCsv.split(",")) {
		const category = normalizeAppCategory(value);
		if (!category || seen.has(category)) continue;
		seen.add(category);
		categories.push(category);
		if (categories.length >= MAX_APP_CATEGORIES) break;
	}

	return categories;
}

export function serializeAppCategories(
	categories: Array<string | null | undefined>
) {
	const parsed = parseAppCategories(categories.filter(Boolean).join(","));
	return parsed.length > 0 ? parsed.join(",") : null;
}

export function normalizeAppCategoryCsv(categoryCsv: string | null | undefined) {
	return serializeAppCategories(categoryCsv?.split(",") ?? []);
}
