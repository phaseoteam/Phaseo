export const MODELS_LAYOUT_EXPERIMENT = "models_page_list_layout";
export type ModelsLayout = "cards" | "list";

export function selectModelsLayout(experiment?: {
	groupName?: string | null;
	value: Record<string, unknown>;
} | null): ModelsLayout {
	return experiment?.groupName && experiment.value.layout === "list" ? "list" : "cards";
}
