"use server";

import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";

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
		const logPrefix = "[workspace-resolve]";
		const rawCookieWorkspaceId = await getActiveWorkspaceIdFromCookieRaw();
		const supabase = await createClient();
		let adminClient: ReturnType<typeof createAdminClient> | null = null;
		try {
			adminClient = createAdminClient();
		} catch {
			adminClient = null;
		}
		const readClient: any = adminClient ?? supabase;
		const {
			data: { user: authUser },
			error: authError,
		} = await supabase.auth.getUser();
		const userId = authUser?.id ?? null;

		const hasRpcAccess = async (
			fnName: "is_workspace_admin" | "is_workspace_member",
			workspaceId: string,
		): Promise<boolean | null> => {
			try {
				const { data, error } = await (supabase as any).rpc(fnName, {
					p_workspace_id: workspaceId,
				});
				if (error) return null;
				return Boolean(data);
			} catch {
				return null;
			}
		};

		const isAccessible = async (workspaceId: string): Promise<boolean> => {
			if (!userId || !workspaceId) return false;

			const adminAccess = await hasRpcAccess("is_workspace_admin", workspaceId);
			if (adminAccess === true) return true;

			const memberAccess = await hasRpcAccess(
				"is_workspace_member",
				workspaceId,
			);
			if (memberAccess === true) return true;

			const { data: membershipRow, error: membershipError } = await readClient
				.from("workspace_members")
				.select("workspace_id")
				.eq("user_id", userId)
				.eq("workspace_id", workspaceId)
				.limit(1)
				.maybeSingle();
			if (!membershipError && membershipRow?.workspace_id) return true;

			const { data: ownedWorkspace, error: ownerError } = await readClient
				.from("workspaces")
				.select("id")
				.eq("id", workspaceId)
				.eq("owner_user_id", userId)
				.limit(1)
				.maybeSingle();
			return !ownerError && Boolean(ownedWorkspace?.id);
		};

		if (rawCookieWorkspaceId) {
			if (await isAccessible(rawCookieWorkspaceId)) {
				console.info(`${logPrefix} resolved from cookie`, {
					userId,
					rawCookieWorkspaceId,
				});
				return rawCookieWorkspaceId;
			}
			console.warn(`${logPrefix} cookie workspace is not accessible`, {
				userId,
				rawCookieWorkspaceId,
			});
			await clearActiveWorkspaceCookie();
		}

		if (authError || !userId) {
			console.warn(`${logPrefix} auth unavailable while resolving workspace`, {
				authError: authError?.message ?? null,
				rawCookieWorkspaceId: rawCookieWorkspaceId ?? null,
			});
			if (rawCookieWorkspaceId) {
				await clearActiveWorkspaceCookie();
			}
			return undefined;
		}

		const { data: userRow } = await readClient
			.from("users")
			.select("default_workspace_id")
			.eq("user_id", userId)
			.maybeSingle();
		const defaultWorkspaceId = String(userRow?.default_workspace_id ?? "").trim();
		if (defaultWorkspaceId && (await isAccessible(defaultWorkspaceId))) {
			console.info(`${logPrefix} resolved from default_workspace_id`, {
				userId,
				defaultWorkspaceId,
			});
			await setActiveWorkspaceCookie(defaultWorkspaceId);
			return defaultWorkspaceId;
		}

		const [{ data: membershipRow }, { data: ownedWorkspace }] = await Promise.all([
			readClient
				.from("workspace_members")
				.select("workspace_id")
				.eq("user_id", userId)
				.order("workspace_id", { ascending: true })
				.limit(1)
				.maybeSingle(),
			readClient
				.from("workspaces")
				.select("id")
				.eq("owner_user_id", userId)
				.order("id", { ascending: true })
				.limit(1)
				.maybeSingle(),
		]);

		const fallbackWorkspaceId =
			String(membershipRow?.workspace_id ?? "").trim() ||
			String(ownedWorkspace?.id ?? "").trim() ||
			undefined;

		if (fallbackWorkspaceId) {
			await supabase
				.from("users")
				.update({ default_workspace_id: fallbackWorkspaceId })
				.eq("user_id", userId);
			await setActiveWorkspaceCookie(fallbackWorkspaceId);
			console.info(`${logPrefix} resolved from fallback`, {
				userId,
				fallbackWorkspaceId,
			});
			return fallbackWorkspaceId;
		}

		console.warn(`${logPrefix} no accessible workspace found`, {
			userId,
			rawCookieWorkspaceId: rawCookieWorkspaceId ?? null,
			defaultWorkspaceId: defaultWorkspaceId || null,
		});
		await clearActiveWorkspaceCookie();
		return undefined;
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
