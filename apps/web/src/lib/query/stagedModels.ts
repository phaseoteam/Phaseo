import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { mapRawToModelCard } from "@/lib/fetchers/models/getAllModels";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import type { ModelsPageModel } from "@/components/(data)/models/Models/modelsDisplay.types";

// The existing account endpoint checks the admin role and sends no-store
// responses. Never request staged records from the public catalogue API.
export async function fetchAdminStagedModels(options: {
	signal?: AbortSignal;
	accessToken?: string | null;
} = {}): Promise<ModelsPageModel[]> {
	if (options.accessToken === null) return [];
	const token = options.accessToken === undefined ? await getBrowserAccessToken() : options.accessToken;
	try {
		const payload = await fetchAccountWebApi<{ models: Array<Record<string, any>> }>(
			"/api/account/models/audit/source?includeHidden=true", token, { signal: options.signal },
		);
		return payload.models.filter((row) => row.hidden === true).map((row) => {
			const organisation = Array.isArray(row.organisation) ? row.organisation[0] : row.organisation;
			return mapRawToModelCard({ ...row, organisation, organisation_id: organisation?.lab_slug ?? row.model_id.split("/")[0] }, {
				gateway_status: "coming_soon",
				gateway_active_provider_count: 0,
				gateway_input_modalities: Array.isArray(row.input_types) ? row.input_types : [],
				gateway_output_modalities: Array.isArray(row.output_types) ? row.output_types : [],
			});
		});
	} catch (error) {
		if (error instanceof WebApiError && (error.status === 401 || error.status === 403)) return [];
		throw error;
	}
}
