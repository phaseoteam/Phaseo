import type { Harness, ModelOption } from "../../shared/workspace";

/** A model id the person added for an agent whose catalog does not list it yet (a new release, a private deployment). */
export type CustomModel = { harness: Harness; id: string; name?: string };
export const customModelsKey = "phaseo.desktop.customModels";

/** The agent's own catalog first; a custom entry it already lists adds nothing. */
export function withCustomModels(models: ModelOption[], custom: readonly CustomModel[], harness: Harness): ModelOption[] {
	const extra = custom.filter(entry => entry.harness === harness && !models.some(model => model.id === entry.id))
		.map(entry => ({ id: entry.id, name: entry.name || entry.id, description: "Added by you in Settings. Its agent decides whether it runs." }));
	return extra.length ? [...models, ...extra] : models;
}

/** A whole list from outside (settings.set): each entry checked as if added one at a time. */
export function validCustomModels(value: unknown, harnesses: readonly string[]): CustomModel[] {
	if (!Array.isArray(value) || value.length > 200) throw new Error("customModels must be a list of up to 200 { harness, id, name? } entries.");
	let list: CustomModel[] = [];
	for (const entry of value as Record<string, unknown>[]) {
		if (!entry || typeof entry.harness !== "string" || !harnesses.includes(entry.harness) || typeof entry.id !== "string" || (entry.name !== undefined && typeof entry.name !== "string")) throw new Error(`Each custom model needs a harness (one of ${harnesses.join(", ")}) and an id.`);
		const next = addCustomModel(list, { harness: entry.harness as Harness, id: entry.id, ...(entry.name ? { name: entry.name as string } : {}) });
		if (typeof next === "string") throw new Error(`${entry.id}: ${next}`);
		list = next;
	}
	return list;
}

/** The list with one more entry, or an error that says what is wrong with it. */
export function addCustomModel(list: readonly CustomModel[], entry: CustomModel): CustomModel[] | string {
	const id = entry.id.trim(), name = entry.name?.trim();
	if (!id) return "Enter the model id the agent expects.";
	if (id.length > 200 || /\s/.test(id)) return "A model id has no spaces and is at most 200 characters.";
	if (list.some(value => value.harness === entry.harness && value.id === id)) return "That model is already in the list.";
	return [...list, { harness: entry.harness, id, ...name ? { name: name.slice(0, 100) } : {} }];
}
