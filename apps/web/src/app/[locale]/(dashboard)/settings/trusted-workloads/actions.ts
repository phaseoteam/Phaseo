"use server";

import { revalidatePath } from "next/cache";
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
		revalidatePath("/settings/trusted-workloads");
		return { ok: true as const, id: result.id };
	} catch (error) {
		return failure(error);
	}
}

export async function createTrustedWorkload(payload: WorkloadCreatePayload) {
	return send("/policies", "POST", payload);
}

export async function updateTrustedWorkload(id: string, payload: WorkloadUpdatePayload) {
	return send(`/policies/${encodeURIComponent(id)}`, "PATCH", payload);
}

export async function setTrustedWorkloadStatus(id: string, status: "active" | "disabled") {
	return send(`/policies/${encodeURIComponent(id)}`, "PATCH", { status });
}

export async function deleteTrustedWorkload(id: string) {
	return send(`/policies/${encodeURIComponent(id)}`, "DELETE");
}
