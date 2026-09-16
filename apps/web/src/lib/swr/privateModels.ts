import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchAuthenticatedPrivateModels<T>(shape: "page" | "table"): Promise<T[]> {
	const accessToken = await getBrowserAccessToken();
	const read = async (scope?: "admin"): Promise<T[]> => {
		try {
			const query = new URLSearchParams({ shape });
			if (scope) query.set("scope", scope);
			const payload = await fetchAccountWebApi<{ private_catalogue?: boolean; models?: T[] }>(
				`/api/account/private-models/catalog?${query.toString()}`,
				accessToken,
			);
			return payload.private_catalogue === true && Array.isArray(payload.models) ? payload.models : [];
		} catch {
			// The public catalogue is also used signed out. Authentication failures
			// and the admin-only scope must not make it unavailable.
			return [];
		}
	};

	const [workspaceModels, adminModels] = await Promise.all([read(), read("admin")]);
	const byModelId = new Map<string, T>();
	for (const model of [...adminModels, ...workspaceModels]) {
		const modelId = String((model as { model_id?: unknown })?.model_id ?? "").trim();
		if (modelId && !byModelId.has(modelId)) byModelId.set(modelId, model);
	}
	return [...byModelId.values()];
}
