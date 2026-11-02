import "server-only";

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";

export type WorkPageContext = { accessToken: string | null; workspaceId: string | null; userId: string | null };

/** Every work page is internal only. Redirects anyone else, then returns the account context. */
export async function requireWorkPage(): Promise<WorkPageContext> {
	await requireInternalAdmin();
	const { accessToken, workspaceId, userId } = await getServerAccountContext();
	return { accessToken, workspaceId, userId: userId ?? null };
}

export type WorkLoad<T> = { ok: true; data: T } | { ok: false; status: number | null; message: string | null };

type QueryValue = string | number | null | undefined;

export function workQuery(workspaceId: string, params: Record<string, QueryValue> = {}): string {
	const search = new URLSearchParams({ workspaceId });
	for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
	return search.toString();
}

/** GET /api/account/work/<path>. Failures come back as values so a page can show them in place. */
export async function loadWork<T>(context: WorkPageContext, path: string, params: Record<string, QueryValue> = {}): Promise<WorkLoad<T>> {
	if (!context.accessToken) return { ok: false, status: 401, message: null };
	if (!context.workspaceId) return { ok: false, status: 400, message: null };
	try {
		const data = await fetchAccountWebApi<T>(`/api/account/work/${path.replace(/^\/+/, "")}?${workQuery(context.workspaceId, params)}`, context.accessToken);
		return { ok: true, data };
	} catch (error) {
		if (error instanceof WebApiError) return { ok: false, status: error.status, message: error.detail ?? null };
		return { ok: false, status: null, message: null };
	}
}

/** Lists come back as { <key>: [...] }; tolerate a bare array too while the API settles. */
export function listFrom<T>(payload: unknown, key: string): T[] {
	if (Array.isArray(payload)) return payload as T[];
	const value = payload && typeof payload === "object" ? (payload as Record<string, unknown>)[key] : undefined;
	return Array.isArray(value) ? (value as T[]) : [];
}
