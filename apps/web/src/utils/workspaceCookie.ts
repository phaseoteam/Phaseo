"use server";

import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";

export async function getActiveWorkspaceIdFromCookieRaw(): Promise<string | undefined> {
	try {
		const cookieStore = await cookies();
		const rawCookieWorkspaceId = String(
			cookieStore.get("activeWorkspaceId")?.value ?? "",
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
		}

		if (authError || !userId) {
			console.warn(`${logPrefix} auth unavailable while resolving workspace`, {
				authError: authError?.message ?? null,
				rawCookieWorkspaceId: rawCookieWorkspaceId ?? null,
			});
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
