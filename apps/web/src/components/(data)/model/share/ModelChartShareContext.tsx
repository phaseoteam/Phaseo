import { createContext, useContext, type ReactNode } from "react";

export type ModelChartShareModel = {
	modelId: string;
	/** Display name with organisation, such as `OpenAI: GPT-6.1 Terra`. */
	modelName: string;
};

const ModelChartShareContext = createContext<ModelChartShareModel | null>(null);

export function ModelChartShareProvider({ value, children }: { value: ModelChartShareModel; children: ReactNode }) {
	return <ModelChartShareContext.Provider value={value}>{children}</ModelChartShareContext.Provider>;
}

/** The model whose page is open, or null outside a model page (charts then hide the share button). */
export function useModelChartShareModel(): ModelChartShareModel | null {
	return useContext(ModelChartShareContext);
}
