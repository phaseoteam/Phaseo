import { fetchOptionalPublicWebApi } from "@/lib/web-api/client";
import { fetchAdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";
import { FREE_ROUTER_MODEL_ID, FREE_ROUTER_NAME, FREE_ROUTER_ORGANISATION_ID, isFreeRouterModelId } from "@/lib/models/freeRouter";

export interface ModelOverviewHeader { model_id: string; name: string; organisation_id: string; organisation: { name: string; country_code: string }; aliases: string[]; family_id?: string; status?: string | null; hidden?: boolean }

export async function fetchModelOverviewHeader(modelId: string, includeHidden: boolean): Promise<ModelOverviewHeader> {
	if (isFreeRouterModelId(modelId)) return { model_id: FREE_ROUTER_MODEL_ID, name: FREE_ROUTER_NAME, organisation_id: FREE_ROUTER_ORGANISATION_ID, organisation: { name: "Phaseo", country_code: "" }, aliases: [], status: "Available", hidden: false };
	if (!includeHidden) { const payload = await fetchOptionalPublicWebApi<{ header: ModelOverviewHeader }>(`/api/_web/models/${encodeURIComponent(modelId)}/header`); if (!payload?.header) throw new Error(`Model not found: ${modelId}`); return payload.header; }
	const source = await fetchAdminModelSource(modelId); const model = source.model; const organisation = Array.isArray(model?.organisation) ? model.organisation[0] : model?.organisation; const id = String(model?.model_id ?? source.canonicalApiId ?? modelId); const organisationId = String(model?.organisation_id ?? id.split("/")[0] ?? "");
	return { model_id: id, name: String(model?.name ?? source.canonicalApiId ?? modelId), organisation_id: organisationId, organisation: { name: String(organisation?.name ?? organisationId), country_code: String(organisation?.country_code ?? "") }, aliases: [...new Set(source.aliases.map((row) => row.alias_slug).filter(Boolean))].sort(), family_id: model?.family_id ?? undefined, status: model?.status ?? null, hidden: Boolean(model?.hidden) };
}

export default async function getModelOverviewHeader(modelId: string, includeHidden: boolean): Promise<ModelOverviewHeader> { return fetchModelOverviewHeader(modelId, includeHidden); }
