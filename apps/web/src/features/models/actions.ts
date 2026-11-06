import { createServerFn } from "@tanstack/react-start";
import { serverAction } from "@/lib/serverFn/actionMiddleware";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export type ModelUpdatePayload = Record<string, any> & { modelId: string };

export const updateModel = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((payload: ModelUpdatePayload) => payload)
	.handler(async ({ data: payload }): Promise<{ ok: boolean; error?: string }> => {
		try {
			const { accessToken } = await getServerAccountContext();
			if (!accessToken) return { ok: false, error: "Unauthorized" };
			return await fetchAccountWebApi<{ ok: boolean; error?: string }>(
				`/api/account/models/${encodeURIComponent(payload.modelId)}/graph`,
				accessToken,
				{ method: "PUT", body: JSON.stringify(payload) },
			);
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : "Model update failed" };
		}
	});
