"use server";

import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import type { SettingsWorkspaceBudget } from "@/lib/fetchers/internal/settingsTypes";
import type { BudgetInterval } from "@/components/(gateway)/settings/budgets/workspaceBudgets";

export type BudgetActionError = { ok: false; status: number | null };
export type BudgetActionResult =
	| { ok: true; budget: SettingsWorkspaceBudget | null; gatewayCacheInvalidated: boolean }
	| BudgetActionError;

const PATH = "/api/account/settings/budgets";

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new WebApiError(PATH, 401);
	if (!workspaceId) throw new WebApiError(PATH, 400);
	return { accessToken, workspaceId };
}

// Server action errors are masked in production, so failures are returned.
// The page maps the status to translated copy.
function failure(error: unknown): BudgetActionError {
	return { ok: false, status: error instanceof WebApiError ? error.status : null };
}

function refresh(): void {
	revalidatePath("/settings/budgets");
}

type WriteResponse = { budget?: SettingsWorkspaceBudget; gatewayCacheInvalidated?: boolean };

/** Amounts are USD; the web API validates and converts them with the control API's rules. */
export async function createWorkspaceBudget(interval: BudgetInterval, limitUsd: number): Promise<BudgetActionResult> {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<WriteResponse>(PATH, context.accessToken, {
			method: "POST",
			body: JSON.stringify({ workspaceId: context.workspaceId, interval, limit: limitUsd }),
		});
		refresh();
		return { ok: true, budget: result.budget ?? null, gatewayCacheInvalidated: result.gatewayCacheInvalidated !== false };
	} catch (error) {
		return failure(error);
	}
}

export async function updateWorkspaceBudget(id: string, limitUsd: number): Promise<BudgetActionResult> {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<WriteResponse>(`${PATH}/${encodeURIComponent(id)}`, context.accessToken, {
			method: "PATCH",
			body: JSON.stringify({ workspaceId: context.workspaceId, limit: limitUsd }),
		});
		refresh();
		return { ok: true, budget: result.budget ?? null, gatewayCacheInvalidated: result.gatewayCacheInvalidated !== false };
	} catch (error) {
		return failure(error);
	}
}

export async function deleteWorkspaceBudget(id: string): Promise<BudgetActionResult> {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<WriteResponse>(`${PATH}/${encodeURIComponent(id)}`, context.accessToken, {
			method: "DELETE",
			body: JSON.stringify({ workspaceId: context.workspaceId }),
		});
		refresh();
		return { ok: true, budget: null, gatewayCacheInvalidated: result.gatewayCacheInvalidated !== false };
	} catch (error) {
		return failure(error);
	}
}
