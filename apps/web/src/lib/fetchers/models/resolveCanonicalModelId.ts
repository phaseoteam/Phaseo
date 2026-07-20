import { fetchPublicWebApi } from "@/lib/web-api/client";
import { fetchAdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";

type ResolveModelIdSource = "direct" | "alias" | "api_model" | "provider_mapping" | "unresolved";
export type ResolveCanonicalModelIdResult = { requestedModelId: string; canonicalModelId: string | null; internalModelId: string | null; source: ResolveModelIdSource };

export async function resolveCanonicalModelId(requestedModelId: string, includeHidden: boolean): Promise<ResolveCanonicalModelIdResult> {
	if (!includeHidden) return (await fetchPublicWebApi<{ resolution: ResolveCanonicalModelIdResult }>(`/api/_web/models/${encodeURIComponent(requestedModelId)}/canonical`)).resolution;
	const source = await fetchAdminModelSource(requestedModelId); const direct = source.internalModelId === requestedModelId; const alias = source.aliases.some((row) => row.alias_slug === requestedModelId);
	return { requestedModelId, canonicalModelId: source.canonicalApiId || source.internalModelId, internalModelId: source.internalModelId, source: direct ? "direct" : alias ? "alias" : source.canonicalApiId === requestedModelId ? "api_model" : source.internalModelId ? "provider_mapping" : "unresolved" };
}
