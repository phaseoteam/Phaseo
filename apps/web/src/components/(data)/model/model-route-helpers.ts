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
import { decodeModelRouteSegment, getModelDetailsHref } from "@/lib/models/modelHref";

export type ModelRouteParams = {
	organisationId: string;
	modelId: string;
};

export function getModelIdFromParams(params: ModelRouteParams): string {
	return `${decodeModelRouteSegment(params.organisationId)}/${decodeModelRouteSegment(params.modelId)}`;
}

export function getModelPath(modelId: string, tab?: string): string {
	const href = getModelDetailsHref(null, modelId) ?? `/models/${modelId}`;
	return tab ? `${href}/${tab}` : href;
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

export function isModelAliasRoute({
	requestedModelId,
	canonicalModelId,
	source,
}: {
	requestedModelId: string;
	canonicalModelId: string;
	source: Awaited<ReturnType<typeof fetchFrontendCanonicalModelId>>["source"];
}): boolean {
	return source === "alias" && requestedModelId !== canonicalModelId;
}

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

	if (!includeHidden) {
		const identityFromOverview = async (modelId: string) => {
			const overview = await fetchFrontendModelOverview(modelId).catch(() => null);
			return overview ? {
				modelId,
				modelName: overview.name?.trim() || fallbackName,
				organisationName: overview.organisation?.name ?? null,
				modelDescription: resolveModelDescription(overview),
			} : null;
		};
		const direct = await identityFromOverview(requestedModelId);
		if (direct) return direct;
		try {
			const resolved = await fetchFrontendCanonicalModelId(requestedModelId, false);
			const canonicalModelId = resolved.canonicalModelId ?? requestedModelId;
			if (canonicalModelId !== requestedModelId) {
				const canonical = await identityFromOverview(canonicalModelId);
				if (canonical) return canonical;
			}
		} catch {
			// Fall through to generated metadata.
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
	source: Awaited<ReturnType<typeof fetchFrontendCanonicalModelId>>["source"];
}> {
	const requestedModelId = getModelIdFromParams(params);
	if (isFreeRouterModelId(requestedModelId)) {
		return {
			requestedModelId: FREE_ROUTER_MODEL_ID,
			canonicalModelId: FREE_ROUTER_MODEL_ID,
			internalModelId: null,
			source: "direct",
		};
	}
	let resolved: Awaited<ReturnType<typeof fetchFrontendCanonicalModelId>>;
	try {
		resolved = await fetchFrontendCanonicalModelId(
			requestedModelId,
			includeHidden,
		);
	} catch {
		// A just-announced model can briefly be ahead of the public catalogue
		// cache. Let the detail shell turn the subsequent missing header into the
		// route's designed 404 instead of surfacing an upstream server error.
		return {
			requestedModelId,
			canonicalModelId: requestedModelId,
			internalModelId: null,
			source: "unresolved",
		};
	}
	return {
		requestedModelId,
		canonicalModelId: resolved.canonicalModelId ?? requestedModelId,
		internalModelId: resolved.internalModelId ?? null,
		source: resolved.source,
	};
}
