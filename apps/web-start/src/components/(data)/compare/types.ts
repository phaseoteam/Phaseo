import type { CompareViewModel } from "./view/types";

export type CompareModelOption = {
	id: string;
	name: string;
	release_date: string | null;
	input_types: string[] | string | null;
	output_types: string[] | string | null;
	provider: { provider_id: string; name: string } | null;
	/** Absent from web API deployments older than the compare view. */
	status?: string | null;
	/** Whether Phaseo routes the model today. */
	routed?: boolean;
};

export function toCompareModelOption(model: CompareViewModel): CompareModelOption {
	return {
		id: model.id,
		name: model.name,
		release_date: model.releaseDate,
		input_types: model.inputTypes,
		output_types: model.outputTypes,
		provider: { provider_id: model.lab.id, name: model.lab.name },
		status: model.status,
		routed: model.providers.length > 0,
	};
}
