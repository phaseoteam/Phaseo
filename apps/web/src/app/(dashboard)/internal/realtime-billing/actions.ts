import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverMutation } from "@/lib/serverFn/actionMiddleware";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import type { Decision, ReviewDetails } from "./types";

export const loadReviewDetails = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((sessionId: string) => sessionId)
	.handler(async ({ data: sessionId }): Promise<ReviewDetails> => {
		await requireInternalAdmin();
		const { accessToken } = await getServerAccountContext();
		return fetchInternalWebApi(`/api/internal/realtime-billing/reviews/${encodeURIComponent(sessionId)}`, accessToken);
	});

export const decideReview = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { sessionId: string; version: number; operationId: string; action: Decision; reason: string }) => input)
	.handler(async ({ data: { sessionId, version, operationId, action, reason } }) => {
		await requireInternalAdmin();
		const { accessToken } = await getServerAccountContext();
		try {
			await fetchInternalWebApi(`/api/internal/realtime-billing/reviews/${encodeURIComponent(sessionId)}/decisions`, accessToken,
				{ method: "POST", body: JSON.stringify({ version, operation_id: operationId, action, reason }) });
		} catch (error) {
			return { error: error instanceof Error ? error.message : "Unable to save decision. Refresh and try again." };
		}
		return { error: null };
	});
