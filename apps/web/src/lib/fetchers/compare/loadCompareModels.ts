import type { ExtendedModel } from "@/data/types";
import { fetchPublicWebApi } from "@/lib/web-api/client";

export async function loadCompareModels(
    includeHidden: boolean
): Promise<ExtendedModel[]> {
	if (includeHidden) {
		throw new Error("Hidden compare models require an authenticated account endpoint");
	}
	const payload = await fetchPublicWebApi<{ models: ExtendedModel[] }>(
		"/api/_web/compare/models",
	);
	return payload.models;
}

export async function loadCompareModelsCached(
    includeHidden: boolean
): Promise<ExtendedModel[]> {
	return loadCompareModels(includeHidden);
}
