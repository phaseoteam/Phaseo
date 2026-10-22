"use server";

import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { mcpConnectionsFlag } from "@/lib/flags";

export type StartConnectionResult =
	| { ok: true; mode: "authorize"; authorizationUrl: string }
	| { ok: true; mode: "connected"; label: string }
	| { ok: false; message: string | null };

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	if (!(await mcpConnectionsFlag().catch(() => false))) throw new WebApiError("/api/account/settings/connections", 404);
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new WebApiError("/api/account/settings/connections", 401);
	if (!workspaceId) throw new WebApiError("/api/account/settings/connections", 400, "Select a workspace first");
	return { accessToken, workspaceId };
}

// Server action errors are masked in production, so failures are returned.
function failureMessage(error: unknown): string | null {
	return error instanceof WebApiError && error.detail && !/^[a-z_]+$/.test(error.detail) ? error.detail : null;
}

export async function startConnectionAction(serverUrl: string, name: string): Promise<StartConnectionResult> {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ mode: "authorize" | "connected"; authorizationUrl?: string; label: string }>(
			"/api/account/settings/connections/start",
			context.accessToken,
			{ method: "POST", body: JSON.stringify({ workspaceId: context.workspaceId, serverUrl, name }) },
		);
		if (result.mode === "authorize" && result.authorizationUrl) return { ok: true, mode: "authorize", authorizationUrl: result.authorizationUrl };
		revalidatePath("/settings/connections");
		return { ok: true, mode: "connected", label: result.label };
	} catch (error) {
		return { ok: false, message: failureMessage(error) };
	}
}

export async function disconnectConnectionAction(connectionId: string): Promise<{ ok: boolean }> {
	try {
		const context = await account();
		await fetchAccountWebApi<{ success: true }>(
			`/api/account/settings/connections/${encodeURIComponent(connectionId)}?workspaceId=${encodeURIComponent(context.workspaceId)}`,
			context.accessToken,
			{ method: "DELETE" },
		);
		revalidatePath("/settings/connections");
		return { ok: true };
	} catch {
		return { ok: false };
	}
}
