import {
	fetchFrontendCanonicalModelId,
	fetchFrontendModelHeader,
	fetchFrontendModelOverview,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import {
	buildGeneratedModelDescription,
	resolveModelDescription,
} from "@/lib/models/modelDescription";
import {
	FREE_ROUTER_DESCRIPTION,
	FREE_ROUTER_MODEL_ID,
	FREE_ROUTER_NAME,
	isFreeRouterModelId,
} from "@/lib/models/freeRouter";

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

export function getModelSectionPath(modelId: string, sectionId: string): string {
	return `${getModelPath(modelId)}#${sectionId}`;
}

export type ModelMetadataIdentity = {
	modelId: string;
	modelName: string;
	organisationName: string | null;
	modelDescription: string | null;
};

export async function getModelMetadataIdentity(
	params: ModelRouteParams,
	includeHidden: boolean,
): Promise<ModelMetadataIdentity> {
	const requestedModelId = getModelIdFromParams(params);
	const fallbackName = decodeURIComponent(params.modelId ?? "").trim() || "AI model";

	if (isFreeRouterModelId(requestedModelId)) {
		return {
			modelId: FREE_ROUTER_MODEL_ID,
			modelName: FREE_ROUTER_NAME,
			organisationName: "Phaseo",
			modelDescription: FREE_ROUTER_DESCRIPTION,
		};
	}

	try {
		const header = await fetchFrontendModelHeader(
			requestedModelId,
			includeHidden,
		);
		if (!header) {
			throw new Error(`Model not found: ${requestedModelId}`);
		}
		const modelOverview = await fetchFrontendModelOverview(
			requestedModelId,
		).catch(() => null);
		return {
			modelId: requestedModelId,
			modelName: header.name?.trim() || fallbackName,
			organisationName: header.organisation?.name ?? null,
			modelDescription: modelOverview
				? resolveModelDescription(modelOverview)
				: buildGeneratedModelDescription({
						model_id: requestedModelId,
						name: header.name?.trim() || fallbackName,
						organisation_id: header.organisation_id,
						organisation: header.organisation,
						status: header.status ?? null,
					}),
		};
	} catch {
		try {
			const resolved = await fetchFrontendCanonicalModelId(
				requestedModelId,
				includeHidden,
			);
			const canonicalModelId = resolved.canonicalModelId ?? requestedModelId;
			if (canonicalModelId !== requestedModelId) {
				const canonicalHeader = await fetchFrontendModelHeader(
					canonicalModelId,
					includeHidden,
				);
				if (!canonicalHeader) {
					throw new Error(`Model not found: ${canonicalModelId}`);
				}
				const canonicalModelOverview = await fetchFrontendModelOverview(
					canonicalModelId,
				).catch(() => null);
				return {
					modelId: canonicalModelId,
					modelName: canonicalHeader.name?.trim() || fallbackName,
					organisationName: canonicalHeader.organisation?.name ?? null,
					modelDescription: canonicalModelOverview
						? resolveModelDescription(canonicalModelOverview)
						: buildGeneratedModelDescription({
								model_id: canonicalModelId,
								name: canonicalHeader.name?.trim() || fallbackName,
								organisation_id: canonicalHeader.organisation_id,
								organisation: canonicalHeader.organisation,
								status: canonicalHeader.status ?? null,
							}),
				};
			}
		} catch {
			// Swallow and return metadata fallback below.
		}

		return {
			modelId: requestedModelId,
			modelName: fallbackName,
			organisationName: null,
			modelDescription: buildGeneratedModelDescription({
				model_id: requestedModelId,
				name: fallbackName,
			}),
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
	if (isFreeRouterModelId(requestedModelId)) {
		return {
			requestedModelId: FREE_ROUTER_MODEL_ID,
			canonicalModelId: FREE_ROUTER_MODEL_ID,
			internalModelId: null,
		};
	}
	const resolved = await fetchFrontendCanonicalModelId(
		requestedModelId,
		includeHidden,
	);
	return {
		requestedModelId,
		canonicalModelId: resolved.canonicalModelId ?? requestedModelId,
		internalModelId: resolved.internalModelId ?? null,
	};
}
