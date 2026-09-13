import type { AdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";

export type AdminModelPreview = {
	modelId: string;
	name: string;
	status: string | null;
	providers: Array<{ id: string; name: string; modelId: string; status: string }>;
};

export function toAdminModelPreview(source: AdminModelSource): AdminModelPreview | null {
	if (!source.model?.hidden) return null;
	return {
		modelId: String(source.model.model_id ?? source.canonicalApiId),
		name: String(source.model.name ?? source.canonicalApiId),
		status: source.model.status ? String(source.model.status) : null,
		providers: source.providerRows.map((row) => ({
			id: String(row.provider_api_model_id ?? row.provider_model_slug ?? ""),
			name: String(row.data_api_providers?.api_provider_name ?? row.provider_id ?? "Provider"),
			modelId: String(row.provider_model_slug ?? ""),
			status: String(row.routing_status ?? "unknown"),
		})),
	};
}
