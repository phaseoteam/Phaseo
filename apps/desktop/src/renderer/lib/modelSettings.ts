import type { Harness, ModelOptionValues } from "../../shared/workspace";
import type { ModelSelection } from "./modelPreferences";

/** The last settings chosen for each model, so picking it again restores them (as T3 Code does). */
type Remembered = Pick<ModelSelection, "reasoningEffort" | "serviceTier" | "options">;
const key = "phaseo.desktop.modelSettings";
const modelKey = (harness: Harness, model: string) => `${harness}:${model}`;

function read(): Record<string, Remembered> {
	try {
		const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
		return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
	} catch { return {}; }
}

export function rememberedSettings(harness: Harness, model: string): Remembered {
	const saved = read()[modelKey(harness, model)];
	if (!saved || typeof saved !== "object") return {};
	const text = (value: unknown) => typeof value === "string" && value.length <= 100 ? value : undefined;
	const options = saved.options && typeof saved.options === "object" && !Array.isArray(saved.options)
		? Object.fromEntries(Object.entries(saved.options).filter(([, value]) => typeof value === "boolean" || text(value) !== undefined)) as ModelOptionValues
		: undefined;
	return { reasoningEffort: text(saved.reasoningEffort), serviceTier: text(saved.serviceTier), ...(options && Object.keys(options).length ? { options } : {}) };
}

export function rememberSettings(selection: ModelSelection) {
	try {
		const saved = read();
		saved[modelKey(selection.harness, selection.model)] = { reasoningEffort: selection.reasoningEffort, serviceTier: selection.serviceTier, options: selection.options };
		localStorage.setItem(key, JSON.stringify(saved));
	} catch { /* Settings still apply to this chat when storage is unavailable. */ }
}
