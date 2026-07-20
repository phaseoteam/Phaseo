"use server";

import { revalidatePath } from "next/cache";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

/**
 * User Authorization Management Actions
 *
 * These actions allow users to manage their OAuth authorizations
 * (view and revoke access to third-party apps).
 */

interface ActionResult {
	data?: any;
	error?: string;
}

/**
 * Revoke OAuth authorization
 *
 * Marks the authorization as revoked, which will cause subsequent
 * API requests with tokens for this authorization to fail.
 */
export async function revokeAuthorizationAction(
	authorizationId: string
): Promise<ActionResult> {
	try {
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) return { error: "Unauthorized" };
		await fetchAccountWebApi(`/api/account/settings/authorized-apps/${encodeURIComponent(authorizationId)}`, accessToken, { method: "DELETE" });

		// Revalidate the page
		revalidatePath("/settings/authorized-apps");

		return { data: { success: true } };
	} catch (error: any) {
		console.error("Error revoking authorization:", error);
		return { error: error.message || "Failed to revoke authorization" };
	}
}

/**
 * Get authorization details
 *
 * Fetches detailed information about a specific authorization.
 */
export async function getAuthorizationDetailsAction(
	authorizationId: string
): Promise<ActionResult> {
	try {
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) return { error: "Unauthorized" };
		const response = await fetchAccountWebApi<{ authorization: unknown }>(`/api/account/settings/authorized-apps/${encodeURIComponent(authorizationId)}`, accessToken);
		return { data: response.authorization };
	} catch (error: any) {
		console.error("Error fetching authorization details:", error);
		return { error: error.message || "Failed to fetch authorization details" };
	}
}
