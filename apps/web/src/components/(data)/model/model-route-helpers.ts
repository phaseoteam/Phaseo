import { resolveCanonicalModelId } from "@/lib/fetchers/models/resolveCanonicalModelId";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";

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

export type ModelMetadataIdentity = {
	modelId: string;
	modelName: string;
	organisationName: string | null;
};

export async function getModelMetadataIdentity(
	params: ModelRouteParams,
	includeHidden: boolean,
): Promise<ModelMetadataIdentity> {
	const requestedModelId = getModelIdFromParams(params);
	const fallbackName = decodeURIComponent(params.modelId ?? "").trim() || "AI model";

	try {
		const header = await getModelOverviewHeader(requestedModelId, includeHidden);
		return {
			modelId: requestedModelId,
			modelName: header.name?.trim() || fallbackName,
			organisationName: header.organisation?.name ?? null,
		};
	} catch {
		try {
			const resolved = await resolveCanonicalModelId(requestedModelId, includeHidden);
			const canonicalModelId = resolved.canonicalModelId ?? requestedModelId;
			if (canonicalModelId !== requestedModelId) {
				const canonicalHeader = await getModelOverviewHeader(
					canonicalModelId,
					includeHidden,
				);
				return {
					modelId: canonicalModelId,
					modelName: canonicalHeader.name?.trim() || fallbackName,
					organisationName: canonicalHeader.organisation?.name ?? null,
				};
			}
		} catch {
			// Swallow and return metadata fallback below.
		}

		return {
			modelId: requestedModelId,
			modelName: fallbackName,
			organisationName: null,
		};
	}
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
