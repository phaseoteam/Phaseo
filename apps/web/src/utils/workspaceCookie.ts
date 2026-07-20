"use server";

import { cookies } from "next/headers";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

const ACTIVE_WORKSPACE_COOKIE_NAME = "activeWorkspaceId";

async function writeActiveWorkspaceCookieValue(workspaceId?: string): Promise<void> {
	const cookieStore: any = await cookies();
	if (!workspaceId) {
		if (typeof cookieStore.delete === "function") {
			cookieStore.delete(ACTIVE_WORKSPACE_COOKIE_NAME);
			return;
		}
		cookieStore.set({
			name: ACTIVE_WORKSPACE_COOKIE_NAME,
			value: "",
			httpOnly: true,
			path: "/",
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			maxAge: 0,
		});
		return;
	}
	cookieStore.set({
		name: ACTIVE_WORKSPACE_COOKIE_NAME,
		value: workspaceId,
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
		const cookieStore = await cookies();
		const rawCookieWorkspaceId = String(
			cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value ?? "",
		).trim();
		return rawCookieWorkspaceId || undefined;
	} catch {
		return undefined;
	}
}

export async function resolveAccessibleWorkspaceIdFromCookie(): Promise<string | undefined> {
	try {
		const rawCookieWorkspaceId = await getActiveWorkspaceIdFromCookieRaw();
		const context = await getServerAccountContext();
		if (!context.accessToken) { await clearActiveWorkspaceCookie(); return undefined; }
		const query = rawCookieWorkspaceId ? `?requested=${encodeURIComponent(rawCookieWorkspaceId)}` : "";
		const result = await fetchAccountWebApi<{ signedIn: boolean; workspaceId: string | null }>(`/api/account/auth/workspace${query}`, context.accessToken);
		if (!result.workspaceId) { await clearActiveWorkspaceCookie(); return undefined; }
		if (result.workspaceId !== rawCookieWorkspaceId) await setActiveWorkspaceCookie(result.workspaceId);
		return result.workspaceId;
	} catch (e) {
		console.warn("[workspace-resolve] unexpected failure", {
			error: String(e),
		});
		return undefined;
	}
}

export async function getWorkspaceIdFromCookie(): Promise<string | undefined> {
	return resolveAccessibleWorkspaceIdFromCookie();
}
