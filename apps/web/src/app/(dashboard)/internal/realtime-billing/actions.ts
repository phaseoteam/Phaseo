"use server";

import { revalidatePath } from "next/cache";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import type { Decision, ReviewDetails } from "./types";

export async function loadReviewDetails(sessionId: string): Promise<ReviewDetails> {
	await requireInternalAdmin();
	const { accessToken } = await getServerAccountContext();
	return fetchInternalWebApi(`/api/internal/realtime-billing/reviews/${encodeURIComponent(sessionId)}`, accessToken);
}

export async function decideReview(sessionId: string, version: number, operationId: string, action: Decision, reason: string) {
	await requireInternalAdmin();
	const { accessToken } = await getServerAccountContext();
	try {
		await fetchInternalWebApi(`/api/internal/realtime-billing/reviews/${encodeURIComponent(sessionId)}/decisions`, accessToken,
			{ method: "POST", body: JSON.stringify({ version, operation_id: operationId, action, reason }) });
	} catch (error) {
		return { error: error instanceof Error ? error.message : "Unable to save decision. Refresh and try again." };
	}
	revalidatePath("/internal/realtime-billing");
	return { error: null };
}
