import { resolveCanonicalModelId } from "@/lib/fetchers/models/resolveCanonicalModelId";

export type ModelRouteParams = {
	organisationId: string;
	modelId: string;
};

export function getModelIdFromParams(params: ModelRouteParams): string {
	return `${params.organisationId}/${params.modelId}`;
}

export function getModelPath(modelId: string, tab?: string): string {
	return tab ? `/models/${modelId}/${tab}` : `/models/${modelId}`;
}

export async function resolveModelRouteIds(
	params: ModelRouteParams,
	includeHidden: boolean,
): Promise<{
	requestedModelId: string;
	canonicalModelId: string;
	internalModelId: string | null;
}> {
	const requestedModelId = getModelIdFromParams(params);
	const resolved = await resolveCanonicalModelId(requestedModelId, includeHidden);
	return {
		requestedModelId,
		canonicalModelId: resolved.canonicalModelId ?? requestedModelId,
		internalModelId: resolved.internalModelId ?? null,
	};
}
