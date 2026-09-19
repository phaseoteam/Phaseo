import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchAuthenticatedPrivateModels<T>(
	shape: "page" | "table",
	options: {
		signal?: AbortSignal;
		accessToken?: string | null;
		workspaceId?: string | null;
	} = {},
): Promise<T[]> {
	const accessToken =
		options.accessToken === undefined
			? await getBrowserAccessToken()
			: options.accessToken;
	const read = async (scope?: "admin"): Promise<T[]> => {
		try {
			const query = new URLSearchParams({ shape });
			if (options.workspaceId) query.set("workspaceId", options.workspaceId);
			if (scope) query.set("scope", scope);
			const payload = await fetchAccountWebApi<{ private_catalogue?: boolean; models?: T[] }>(
				`/api/account/private-models/catalog?${query.toString()}`,
				accessToken,
				{ signal: options.signal },
			);
			return payload.private_catalogue === true && Array.isArray(payload.models) ? payload.models : [];
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") throw error;
			// The public catalogue is also used signed out. Authentication failures
			// and the admin-only scope must not make it unavailable.
			return [];
		}
	};

	const [workspaceModels, adminModels] = await Promise.all([read(), read("admin")]);
	const byIdentity = new Map<string, T>();
	for (const model of [...adminModels, ...workspaceModels]) {
		const value = model as { id?: unknown; model_id?: unknown; modelId?: unknown; endpoint?: unknown };
		const modelId = String(value?.model_id ?? value?.modelId ?? "").trim();
		const identity = shape === "table"
			? String(value?.id ?? JSON.stringify([modelId, value?.endpoint ?? ""]))
			: modelId;
		if (modelId && !byIdentity.has(identity)) byIdentity.set(identity, model);
	}
	return [...byIdentity.values()];
}
