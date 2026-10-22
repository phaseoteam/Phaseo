"use server";

import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";

export type BulkKeyActionInput =
	| { action: "pause" | "revoke" }
	| { action: "set_monthly_spend_limit"; monthlyCostNanos: number }
	| { action: "set_expiry"; expiresAt: string }
	| { action: "set_storage_locations"; storageLocations: string[] };

export type BulkKeyActionResult =
	| { ok: true; changed: string[]; skipped: number }
	| { ok: false; status: number | null; message: string | null };

// Server action errors are masked in production, so failures are returned.
export async function bulkUpdateKeysAction(workspaceId: string, keyIds: string[], input: BulkKeyActionInput): Promise<BulkKeyActionResult> {
	try {
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) return { ok: false, status: 401, message: null };
		const result = await fetchAccountWebApi<{ changed: string[]; skipped: number }>("/api/account/settings/key-security/bulk", accessToken, {
			method: "POST",
			body: JSON.stringify({ ...input, workspaceId, keyIds }),
		});
		for (const path of ["/settings/security", "/settings/keys"]) revalidatePath(path);
		return { ok: true, ...result };
	} catch (error) {
		return error instanceof WebApiError
			? { ok: false, status: error.status, message: error.detail ?? null }
			: { ok: false, status: null, message: null };
	}
}
