import type { ModelCard } from "@/lib/fetchers/models/getAllModels";
import { fetchPublicWebApi } from "@/lib/web-api/client";

// The same compact request as the /models page, so it is usually already edge-cached.
const MODELS_PAGE_PATH = "/api/_web/models?limit=2000&offset=0&shape=page&projection=6&catalogue_version=v2&include_metrics=false" as const;
const SERVED_GATEWAY_STATUSES = new Set(["active", "deprecated"]);

type ModelsPageRow = {
	model_id?: string | null;
	name?: string | null;
	status?: string | null;
	organisation_id?: string | null;
	organisation_name?: string | null;
	organisation_colour?: string | null;
	primary_date?: string | null;
	primary_timestamp?: number | null;
	primary_group_key?: string | null;
	gateway_status?: string | null;
	gateway_active_provider_count?: number | null;
};

/** Whether the gateway still serves the model through at least one active provider. */
export function isServedModel(row: ModelsPageRow): boolean {
	return SERVED_GATEWAY_STATUSES.has(String(row.gateway_status ?? "").toLowerCase()) && (row.gateway_active_provider_count ?? 0) > 0;
}

export function toPresetModels(rows: ModelsPageRow[]): ModelCard[] {
	return rows.filter((row) => row.model_id && isServedModel(row)).map((row) => ({
		model_id: String(row.model_id),
		name: row.name || String(row.model_id),
		status: row.status ?? null,
		organisation_id: row.organisation_id ?? "",
		organisation_name: row.organisation_name ?? null,
		organisation_colour: row.organisation_colour ?? null,
		primary_date: row.primary_date ?? null,
		primary_timestamp: row.primary_timestamp ?? null,
		primary_group_key: row.primary_group_key ?? null,
	}));
}

/** Models a preset can route to: those the gateway currently serves. */
export async function fetchPresetModels(): Promise<ModelCard[]> {
	const page = await fetchPublicWebApi<{ models: ModelsPageRow[] }>(MODELS_PAGE_PATH);
	return toPresetModels(page.models ?? []);
}
