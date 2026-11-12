import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import type { SettingsDepartmentBudget, SettingsWorkspaceBudget } from "@/lib/fetchers/internal/settingsTypes";
import type { BudgetInterval } from "@/components/(gateway)/settings/budgets/workspaceBudgets";

export type BudgetActionError = { ok: false; status: number | null };
export type DepartmentBudgetActionResult = { ok: true; budget: SettingsDepartmentBudget | null } | BudgetActionError;
export type DepartmentBudgetInterval = Exclude<BudgetInterval, "lifetime">;
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

type WriteResponse = { budget?: SettingsWorkspaceBudget; gatewayCacheInvalidated?: boolean };

/** Amounts are USD; the web API validates and converts them with the control API's rules. */
export const createWorkspaceBudget = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { interval: BudgetInterval; limitUsd: number }) => input)
	.handler(async ({ data: { interval, limitUsd } }): Promise<BudgetActionResult> => {
		try {
			const context = await account();
			const result = await fetchAccountWebApi<WriteResponse>(PATH, context.accessToken, {
				method: "POST",
				body: JSON.stringify({ workspaceId: context.workspaceId, interval, limit: limitUsd }),
			});
			return { ok: true, budget: result.budget ?? null, gatewayCacheInvalidated: result.gatewayCacheInvalidated !== false };
		} catch (error) {
			return failure(error);
		}
	});

export const updateWorkspaceBudget = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; limitUsd: number }) => input)
	.handler(async ({ data: { id, limitUsd } }): Promise<BudgetActionResult> => {
		try {
			const context = await account();
			const result = await fetchAccountWebApi<WriteResponse>(`${PATH}/${encodeURIComponent(id)}`, context.accessToken, {
				method: "PATCH",
				body: JSON.stringify({ workspaceId: context.workspaceId, limit: limitUsd }),
			});
			return { ok: true, budget: result.budget ?? null, gatewayCacheInvalidated: result.gatewayCacheInvalidated !== false };
		} catch (error) {
			return failure(error);
		}
	});

export const deleteWorkspaceBudget = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }): Promise<BudgetActionResult> => {
		try {
			const context = await account();
			const result = await fetchAccountWebApi<WriteResponse>(`${PATH}/${encodeURIComponent(id)}`, context.accessToken, {
				method: "DELETE",
				body: JSON.stringify({ workspaceId: context.workspaceId }),
			});
			return { ok: true, budget: null, gatewayCacheInvalidated: result.gatewayCacheInvalidated !== false };
		} catch (error) {
			return failure(error);
		}
	});

// The gateway reseeds department budgets about every minute, so changes need no cache invalidation.
const DEPARTMENT_PATH = `${PATH}/departments`;

export const createDepartmentBudget = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { departmentId: string; interval: DepartmentBudgetInterval; limitUsd: number }) => input)
	.handler(async ({ data: { departmentId, interval, limitUsd } }): Promise<DepartmentBudgetActionResult> => {
		try {
			const context = await account();
			const result = await fetchAccountWebApi<{ budget?: SettingsDepartmentBudget }>(DEPARTMENT_PATH, context.accessToken, {
				method: "POST",
				body: JSON.stringify({ workspaceId: context.workspaceId, departmentId, interval, limit: limitUsd }),
			});
			return { ok: true, budget: result.budget ?? null };
		} catch (error) {
			return failure(error);
		}
	});

export const updateDepartmentBudget = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; limitUsd: number }) => input)
	.handler(async ({ data: { id, limitUsd } }): Promise<DepartmentBudgetActionResult> => {
		try {
			const context = await account();
			const result = await fetchAccountWebApi<{ budget?: SettingsDepartmentBudget }>(`${DEPARTMENT_PATH}/${encodeURIComponent(id)}`, context.accessToken, {
				method: "PATCH",
				body: JSON.stringify({ workspaceId: context.workspaceId, limit: limitUsd }),
			});
			return { ok: true, budget: result.budget ?? null };
		} catch (error) {
			return failure(error);
		}
	});

export const deleteDepartmentBudget = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }): Promise<DepartmentBudgetActionResult> => {
		try {
			const context = await account();
			await fetchAccountWebApi(`${DEPARTMENT_PATH}/${encodeURIComponent(id)}`, context.accessToken, {
				method: "DELETE",
				body: JSON.stringify({ workspaceId: context.workspaceId }),
			});
			return { ok: true, budget: null };
		} catch (error) {
			return failure(error);
		}
	});
