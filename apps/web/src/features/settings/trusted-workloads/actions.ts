import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { workloadIdentityFlag } from "@/lib/flags";
import type { WorkloadCreatePayload, WorkloadUpdatePayload } from "@/components/(gateway)/settings/trusted-workloads/trustedWorkloadForm";

export type TrustedWorkloadActionError = { ok: false; status: number | null; message: string | null; code: string | null };

const BASE = "/api/account/settings/trusted-workloads";

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	if (!(await workloadIdentityFlag().catch(() => false))) throw new WebApiError(BASE, 404);
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new WebApiError(BASE, 401);
	if (!workspaceId) throw new WebApiError(BASE, 400, "Select a workspace first");
	return { accessToken, workspaceId };
}

// Server action errors are masked in production, so failures are returned.
function failure(error: unknown): TrustedWorkloadActionError {
	if (error instanceof WebApiError) {
		const detail = error.detail ?? null;
		const code = detail && /^[a-z_]+$/.test(detail) ? detail : null;
		return { ok: false, status: error.status, message: code ? null : detail, code };
	}
	return { ok: false, status: null, message: null, code: null };
}

async function send(path: string, method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown> = {}) {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true; id: string | null }>(`${BASE}${path}`, context.accessToken, {
			method,
			body: JSON.stringify({ ...body, workspaceId: context.workspaceId }),
		});
		return { ok: true as const, id: result.id };
	} catch (error) {
		return failure(error);
	}
}

export const createTrustedWorkload = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((payload: WorkloadCreatePayload) => payload)
	.handler(async ({ data: payload }) => {
		return send("/policies", "POST", payload);
	});

export const updateTrustedWorkload = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; payload: WorkloadUpdatePayload }) => input)
	.handler(async ({ data: { id, payload } }) => {
		return send(`/policies/${encodeURIComponent(id)}`, "PATCH", payload);
	});

export const setTrustedWorkloadStatus = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; status: "active" | "disabled" }) => input)
	.handler(async ({ data: { id, status } }) => {
		return send(`/policies/${encodeURIComponent(id)}`, "PATCH", { status });
	});

export const deleteTrustedWorkload = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		return send(`/policies/${encodeURIComponent(id)}`, "DELETE");
	});
