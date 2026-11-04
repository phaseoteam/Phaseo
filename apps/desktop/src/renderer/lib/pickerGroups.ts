import { usePersistedState } from "./persistedState";

/**
 * Which groups the model picker's left column shows, and in what order: agents (codex, claude…), "phaseo" for all of
 * Phaseo's models, and labs ("lab:openai"). Kept on this device. A group never ordered keeps its place by default (labs by
 * this week's use) after the ordered ones, so new labs still appear.
 */
export type PickerGroupPrefs = { order: string[]; hidden: string[] };
export const pickerGroupsKey = "phaseo.desktop.pickerGroups";
export const defaultPickerGroups: PickerGroupPrefs = { order: [], hidden: [] };

const ids = (value: unknown) => Array.isArray(value) && value.length <= 500 && value.every(entry => typeof entry === "string" && entry.length > 0 && entry.length <= 120);
export function validPickerGroups(value: unknown): PickerGroupPrefs {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("pickerGroups must be an object with order and hidden.");
	const { order = [], hidden = [], ...rest } = value as Record<string, unknown>;
	if (Object.keys(rest).length) throw new Error(`pickerGroups has unknown keys: ${Object.keys(rest).join(", ")}.`);
	if (!ids(order) || !ids(hidden)) throw new Error("pickerGroups order and hidden are lists of group ids, such as codex, phaseo or lab:openai.");
	return { order: [...new Set(order as string[])], hidden: [...new Set(hidden as string[])] };
}

/** The groups as chosen: hidden ones gone, ordered ones first in their order, the rest after in their default order. */
export function arrangeGroups<T extends { id: string }>(groups: readonly T[], prefs: PickerGroupPrefs): T[] {
	const rank = new Map(prefs.order.map((id, index) => [id, index]));
	const hidden = new Set(prefs.hidden);
	return groups.filter(group => !hidden.has(group.id)).map((group, index) => ({ group, index }))
		.sort((a, b) => (rank.get(a.group.id) ?? Infinity) - (rank.get(b.group.id) ?? Infinity) || a.index - b.index).map(({ group }) => group);
}

export function usePickerGroups() {
	const [value, setValue] = usePersistedState<PickerGroupPrefs>(pickerGroupsKey, defaultPickerGroups);
	let prefs = defaultPickerGroups;
	try { prefs = validPickerGroups(value); } catch { /* A broken value shows every group in its default order. */ }
	return [prefs, setValue] as const;
}
