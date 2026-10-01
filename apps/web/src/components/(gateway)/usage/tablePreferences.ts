export type TableColumnPreference<Id extends string = string> = {
	id: Id;
	visible: boolean;
	pinned?: boolean;
};
export type TableDensity = "compact" | "regular" | "expanded";

export type TableColumnDefinition<Id extends string = string> = {
	id: Id;
	label: string;
	numeric?: boolean;
	description?: string;
};

export function normalizeTableColumns<Id extends string>(
	value: unknown,
	definitions: readonly TableColumnDefinition<Id>[],
): TableColumnPreference<Id>[] {
	const result: TableColumnPreference<Id>[] = [];
	if (Array.isArray(value))
		for (const entry of value) {
			if (
				!entry ||
				typeof entry !== "object" ||
				typeof entry.visible !== "boolean" ||
				!definitions.some(({ id }) => id === entry.id) ||
				result.some(({ id }) => id === entry.id)
			)
				continue;
			result.push({
				id: entry.id,
				visible: entry.visible,
				...(entry.pinned === true ? { pinned: true } : {}),
			});
		}
	for (const { id } of definitions)
		if (!result.some((entry) => entry.id === id))
			result.push({ id, visible: true });
	if (result.length && !result.some(({ visible }) => visible))
		result[0].visible = true;
	return [
		...result.filter(({ pinned }) => pinned),
		...result.filter(({ pinned }) => !pinned),
	];
}
