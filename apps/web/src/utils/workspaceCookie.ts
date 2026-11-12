// Server only: reads the request cookies and sets response cookies.
import { currentRequestCookie, deleteResponseCookie, setResponseCookie } from "@/lib/server/currentRequest";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

const ACTIVE_WORKSPACE_COOKIE_NAME = "activeWorkspaceId";

async function writeActiveWorkspaceCookieValue(workspaceId?: string): Promise<void> {
	if (!workspaceId) {
		deleteResponseCookie(ACTIVE_WORKSPACE_COOKIE_NAME, { path: "/" });
		return;
	}
	setResponseCookie(ACTIVE_WORKSPACE_COOKIE_NAME, workspaceId, {
		httpOnly: true,
		path: "/",
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		maxAge: 60 * 60 * 24 * 30,
	});
}

export async function setActiveWorkspaceCookie(workspaceId: string): Promise<void> {
	const normalized = String(workspaceId ?? "").trim();
	if (!normalized) return;
	try {
		await writeActiveWorkspaceCookieValue(normalized);
	} catch (error) {
		console.warn("[workspace-cookie] failed to set active workspace cookie", {
			workspaceId: normalized,
			error: String(error),
		});
	}
}

export async function setActiveWorkspaceCookieOrThrow(workspaceId: string): Promise<void> {
	const normalized = String(workspaceId ?? "").trim();
	if (!normalized) throw new Error("A workspace is required.");
	await writeActiveWorkspaceCookieValue(normalized);
}

export async function clearActiveWorkspaceCookie(): Promise<void> {
	try {
		await writeActiveWorkspaceCookieValue(undefined);
	} catch (error) {
		console.warn("[workspace-cookie] failed to clear active workspace cookie", {
			error: String(error),
		});
	}
}

async function getActiveWorkspaceIdFromCookieRaw(): Promise<string | undefined> {
	try {
		const rawCookieWorkspaceId = String(
			currentRequestCookie(ACTIVE_WORKSPACE_COOKIE_NAME) ?? "",
		).trim();
		return rawCookieWorkspaceId || undefined;
	} catch {
		return undefined;
	}
}

export async function resolveAccessibleWorkspaceIdFromCookie(options?: {
	throwOnFailure?: boolean;
	persistCookie?: boolean;
}): Promise<string | undefined> {
	const persistCookie = options?.persistCookie === true;
	try {
		const rawCookieWorkspaceId = await getActiveWorkspaceIdFromCookieRaw();
		const context = await getServerAccountContext();
		if (!context.accessToken) {
			if (persistCookie) await clearActiveWorkspaceCookie();
			return undefined;
		}
		const query = rawCookieWorkspaceId ? `?requested=${encodeURIComponent(rawCookieWorkspaceId)}` : "";
		const result = await fetchAccountWebApi<{ signedIn: boolean; workspaceId: string | null }>(`/api/account/auth/workspace${query}`, context.accessToken);
		if (!result.workspaceId) {
			if (persistCookie) await clearActiveWorkspaceCookie();
			return undefined;
		}
		if (persistCookie && result.workspaceId !== rawCookieWorkspaceId) {
			await setActiveWorkspaceCookie(result.workspaceId);
		}
		return result.workspaceId;
	} catch (e) {
		console.warn("[workspace-resolve] unexpected failure", {
			error: String(e),
		});
		if (options?.throwOnFailure) throw e;
		return undefined;
	}
}

export async function getWorkspaceIdFromCookie(): Promise<string | undefined> {
	return resolveAccessibleWorkspaceIdFromCookie();
}
