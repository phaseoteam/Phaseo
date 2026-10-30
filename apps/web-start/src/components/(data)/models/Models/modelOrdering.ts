import type { ModelsPageModel } from "./modelsDisplay.types";

/** Preserve the catalogue payload's canonical order when lifecycle dates tie. */
export function compareModelsByNewest(
	left: ModelsPageModel,
	right: ModelsPageModel,
): number {
	const leftTimestamp = left.primary_timestamp ?? Number.NEGATIVE_INFINITY;
	const rightTimestamp = right.primary_timestamp ?? Number.NEGATIVE_INFINITY;
	return leftTimestamp === rightTimestamp ? 0 : rightTimestamp - leftTimestamp;
}
