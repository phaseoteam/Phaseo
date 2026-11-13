// Purpose: Workspace control-plane routes.
// Why: Exposes elevated workspace lifecycle operations behind management-key auth.
// How: Resolves the current workspace owner from the management key and scopes CRUD to that owner.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { json, withRuntime } from "@/routes/utils";
import { internalServerError, requireCapability, requireOAuthWorkspaceRole, requireWorkspaceOwner, rejectThirdPartyOAuthSpendingChange } from "./route-helpers";
import { ensureWorkspaceWalletProvisioned, userHasPaidWorkspaceAccess } from "./management-helpers";
import { retryTransaction } from "@/lib/retry-transaction";

type WorkspaceRow = {
	id: string;
	name: string | null;
	slug: string | null;
	owner_user_id: string | null;
	created_at?: string | null;
	updated_at?: string | null;
};

function assertSupabaseWrite(result: { error?: { message?: string | null } | null }, fallbackMessage: string): void {
	if (result?.error) {
		throw new Error(result.error.message || fallbackMessage);
	}
}

function parsePathId(url: URL): string | null {
	const segments = url.pathname.split("/").filter(Boolean);
	const candidate = segments.at(-1);
	if (!candidate || candidate === "workspaces") return null;
	return decodeURIComponent(candidate).trim() || null;
}

function parseWorkspaceResourceId(url: URL): string | null {
	const segments = url.pathname.split("/").filter(Boolean);
	const workspacesIndex = segments.lastIndexOf("workspaces");
	if (workspacesIndex < 0) return null;
	const candidate = segments[workspacesIndex + 1];
	if (!candidate) return null;
	return decodeURIComponent(candidate).trim() || null;
}

function isValidSlug(slug: string): boolean {
	return /^[a-z0-9-]{1,50}$/.test(slug);
}

function makeSlug(name: string): string {
	const base = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 42);
	const suffix = Date.now().toString(36).slice(-6);
	return `${base || "workspace"}-${suffix}`.slice(0, 50);
}

function formatWorkspace(row: WorkspaceRow) {
	return {
		id: row.id,
		name: row.name ?? null,
		slug: row.slug ?? null,
		created_by: row.owner_user_id ?? null,
		created_at: row.created_at ?? null,
		updated_at: row.updated_at ?? null,
	};
}

function isValidWorkspaceRole(value: unknown): value is "owner" | "admin" | "member" {
	const normalized = String(value ?? "").trim().toLowerCase();
	return normalized === "owner" || normalized === "admin" || normalized === "member";
}

async function resolveOwnerUserId(authWorkspaceId: string): Promise<string> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("workspaces")
		.select("owner_user_id")
		.eq("id", authWorkspaceId)
		.maybeSingle();
	if (error) {
		throw new Error(error.message || "Failed to resolve workspace owner");
	}
	const ownerUserId = String((data as { owner_user_id?: unknown } | null)?.owner_user_id ?? "").trim();
	if (!ownerUserId) {
		throw new Error("Workspace owner not found");
	}
	return ownerUserId;
}

async function findWorkspaceById(workspaceId: string): Promise<WorkspaceRow | null> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("workspaces")
		.select("id, name, slug, owner_user_id, created_at, updated_at")
		.eq("id", workspaceId)
		.maybeSingle();
	if (error) {
		throw new Error(error.message || "Failed to fetch workspace");
	}
	return (data as WorkspaceRow | null) ?? null;
}

async function isDefaultWorkspaceForUser(userId: string, workspaceId: string): Promise<boolean> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("users")
		.select("default_workspace_id")
		.eq("user_id", userId)
		.maybeSingle();
	if (error) {
		throw new Error(error.message || "Failed to resolve default workspace");
	}
	return String((data as { default_workspace_id?: unknown } | null)?.default_workspace_id ?? "").trim() === workspaceId;
}

export async function resolveAuthorizedWorkspace(authWorkspaceId: string, identifier: string): Promise<WorkspaceRow | null> {
	const workspace = await findWorkspaceById(authWorkspaceId);
	if (!workspace) return null;
	const normalizedIdentifier = identifier.trim();
	if (!normalizedIdentifier) return null;
	if (normalizedIdentifier === workspace.id) return workspace;
	if (normalizedIdentifier === String(workspace.slug ?? "").trim()) return workspace;
	return null;
}

async function cleanupProvisioningFailedWorkspace(workspaceId: string, ownerUserId: string): Promise<void> {
	const supabase = getSupabaseAdmin();
	const cleanupResults = [
		await supabase.from("workspace_settings").delete().eq("workspace_id", workspaceId),
		await retryTransaction(() => supabase.from("workspace_members").delete().eq("workspace_id", workspaceId)),
		await supabase.from("wallets").delete().eq("workspace_id", workspaceId),
		await supabase.from("management_keys").delete().eq("workspace_id", workspaceId),
		await retryTransaction(() => supabase.from("workspaces").delete().eq("id", workspaceId).eq("owner_user_id", ownerUserId)),
	];
	const failed = cleanupResults.find((result) => result?.error);
	if (failed?.error) {
		throw new Error(failed.error.message || "Failed to roll back workspace after provisioning error");
	}
}

function parsePagination(url: URL): { offset: number; limit: number } | null {
	const rawOffset = url.searchParams.get("offset") ?? "0";
	const rawLimit = url.searchParams.get("limit") ?? "100";
	const offset = Number(rawOffset);
	const limit = Number(rawLimit);
	if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) return null;
	return { offset, limit };
}

async function resolveWorkspaceMembers(workspaceId: string, pagination?: { offset: number; limit: number }) {
	const supabase = getSupabaseAdmin();
	let query = supabase
		.from("workspace_members")
		.select("workspace_id, user_id, role, joined_at", { count: "exact" })
		.eq("workspace_id", workspaceId)
		.order("joined_at", { ascending: true });
	if (pagination) query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
	const { data, error, count } = await query;
	if (error) {
		throw new Error(error.message || "Failed to load workspace members");
	}
	const userIds = (data ?? []).map((row) => String(row.user_id ?? "").trim()).filter(Boolean);
	const { data: userRows, error: userError } = userIds.length
		? await supabase.from("users").select("user_id, display_name").in("user_id", userIds)
		: { data: [], error: null };
	if (userError) {
		throw new Error(userError.message || "Failed to load member profiles");
	}
	const usersById = new Map(
		(userRows ?? []).map((row) => [
			String(row.user_id),
			{
				display_name: row.display_name ?? null,
			},
		]),
	);
	const members = (data ?? []).map((row) => ({
		workspace_id: row.workspace_id,
		user_id: row.user_id,
		role: row.role,
		joined_at: (row as { joined_at?: string | null }).joined_at ?? null,
		display_name: usersById.get(String(row.user_id))?.display_name ?? null,
	}));
	return { members, totalCount: count ?? members.length };
}

async function handleListWorkspaces(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.WORKSPACES_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	try {
		const workspace = await findWorkspaceById(auth.value.workspaceId);
		if (!workspace) {
			return json({ error: "not_found", message: "Workspace not found" }, 404, { "Cache-Control": "no-store" });
		}

		return json(
			{
				data: [formatWorkspace(workspace)],
				total_count: 1,
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	} catch (error: any) {
		const message = String(error?.message ?? error);
		return json({ error: "failed", message }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleGetWorkspace(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.WORKSPACES_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const identifier = parsePathId(new URL(req.url));
	if (!identifier) {
		return json({ error: "bad_request", message: "Workspace id or slug is required" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const workspace = await resolveAuthorizedWorkspace(auth.value.workspaceId, identifier);
		if (!workspace) {
			return json({ error: "not_found", message: "Workspace not found" }, 404, { "Cache-Control": "no-store" });
		}
		return json({ data: formatWorkspace(workspace) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("workspaces.get", error);
	}
}

async function handleCreateWorkspace(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.WORKSPACES_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
		throw error;
	}

	const name = String(body.name ?? "").trim();
	if (!name || name.length > 100) {
		return json({ error: "bad_request", message: "name is required and must be 1-100 characters" }, 400, { "Cache-Control": "no-store" });
	}
	const requestedSlug = String(body.slug ?? "").trim().toLowerCase();
	const slug = requestedSlug || makeSlug(name);
	if (!isValidSlug(slug)) {
		return json({ error: "bad_request", message: "slug must match ^[a-z0-9-]+$ and be 1-50 characters" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const ownerUserId = await resolveOwnerUserId(auth.value.workspaceId);
		const hasPaidWorkspaceAccess = await userHasPaidWorkspaceAccess(ownerUserId);
		if (!hasPaidWorkspaceAccess) {
			return json(
				{
					error: "workspace_upgrade_required",
					message: "Additional workspaces unlock after your first credit deposit. Free accounts can use the personal workspace only.",
				},
				403,
				{ "Cache-Control": "no-store" },
			);
		}
		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase
			.from("workspaces")
			.insert({
				name,
				slug,
				owner_user_id: ownerUserId,
			})
			.select("id, name, slug, owner_user_id, created_at, updated_at")
			.maybeSingle();
		if (error) {
			throw new Error(error.message || "Failed to create workspace");
		}
		const workspaceId = String((data as WorkspaceRow | null)?.id ?? "").trim();
		if (!workspaceId) {
			throw new Error("Workspace creation returned no id");
		}
		try {
			const memberResult = await retryTransaction(() => supabase
				.from("workspace_members")
				.upsert(
					{ workspace_id: workspaceId, user_id: ownerUserId, role: "owner" },
					{ onConflict: "workspace_id,user_id", ignoreDuplicates: true },
				));
			assertSupabaseWrite(memberResult, "Failed to create workspace owner membership");
			const settingsResult = await supabase
				.from("workspace_settings")
				.upsert({ workspace_id: workspaceId, routing_mode: "balanced" }, { onConflict: "workspace_id", ignoreDuplicates: false });
			assertSupabaseWrite(settingsResult, "Failed to initialize workspace settings");
		} catch (error) {
			try {
				await cleanupProvisioningFailedWorkspace(workspaceId, ownerUserId);
			} catch (cleanupError) {
				const cleanupMessage = String((cleanupError as any)?.message ?? cleanupError);
				const originalMessage = String((error as any)?.message ?? error);
				throw new Error(`${originalMessage}; rollback_failed: ${cleanupMessage}`);
			}
			throw error;
		}
		// The wallet (Stripe customer) is optional at creation time, as in the web
		// create-team flow: billing creates it on the first checkout. Never fail or
		// roll back a created workspace because Stripe is unavailable.
		try {
			await ensureWorkspaceWalletProvisioned({
				workspaceId,
				userId: ownerUserId,
			});
		} catch (walletError) {
			console.error("[workspaces.create] wallet provisioning deferred", {
				workspaceId,
				error: String((walletError as any)?.message ?? walletError),
			});
		}
		await recordWorkspaceAuditEvent(supabase, {
			workspaceId,
			actorUserId: auth.value.userId,
			action: "workspace.created",
			targetType: "workspace",
			targetId: workspaceId,
			targetName: name,
			metadata: { slug },
			requestId: auth.value.requestId,
		});

		return json({ data: formatWorkspace(data as WorkspaceRow) }, 201, { "Cache-Control": "no-store" });
	} catch (error: any) {
		const message = String(error?.message ?? error);
		return json({ error: "failed", message }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleUpdateWorkspace(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.WORKSPACES_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const identifier = parsePathId(new URL(req.url));
	if (!identifier) {
		return json({ error: "bad_request", message: "Workspace id or slug is required" }, 400, { "Cache-Control": "no-store" });
	}

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
		throw error;
	}

	const updatePayload: Record<string, unknown> = {};
	if (typeof body.name === "string") {
		const name = body.name.trim();
		if (!name || name.length > 100) {
			return json({ error: "bad_request", message: "name must be 1-100 characters" }, 400, { "Cache-Control": "no-store" });
		}
		updatePayload.name = name;
	}
	if (typeof body.slug === "string") {
		const slug = body.slug.trim().toLowerCase();
		if (!isValidSlug(slug)) {
			return json({ error: "bad_request", message: "slug must match ^[a-z0-9-]+$ and be 1-50 characters" }, 400, { "Cache-Control": "no-store" });
		}
		updatePayload.slug = slug;
	}
	if (Object.keys(updatePayload).length === 0) {
		return json({ error: "bad_request", message: "No supported workspace fields were provided" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const existing = await resolveAuthorizedWorkspace(auth.value.workspaceId, identifier);
		if (!existing) {
			return json({ error: "not_found", message: "Workspace not found" }, 404, { "Cache-Control": "no-store" });
		}
		const ownerUserId = String(existing.owner_user_id ?? "").trim();
		if (!ownerUserId) {
			throw new Error("Workspace owner not found");
		}
		if (await isDefaultWorkspaceForUser(ownerUserId, existing.id)) {
			return json(
				{ error: "bad_request", message: "Personal workspace cannot be renamed." },
				400,
				{ "Cache-Control": "no-store" },
			);
		}

		const supabase = getSupabaseAdmin();
		const { error } = await supabase
			.from("workspaces")
			.update(updatePayload)
			.eq("id", existing.id)
			.eq("owner_user_id", ownerUserId);
		if (error) {
			throw new Error(error.message || "Failed to update workspace");
		}

		const updated = await findWorkspaceById(existing.id);
		if (!updated) {
			throw new Error("Workspace update succeeded but refetch failed");
		}
		await recordWorkspaceAuditEvent(supabase, {
			workspaceId: existing.id,
			actorUserId: auth.value.userId,
			action: "workspace.updated",
			targetType: "workspace",
			targetId: existing.id,
			targetName: updated.name,
			metadata: { changed_fields: Object.keys(updatePayload) },
			requestId: auth.value.requestId,
		});

		return json({ data: formatWorkspace(updated) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("workspaces.update", error);
	}
}

async function handleDeleteWorkspace(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.WORKSPACES_DELETE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const identifier = parsePathId(new URL(req.url));
	if (!identifier) {
		return json({ error: "bad_request", message: "Workspace id or slug is required" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const workspace = await resolveAuthorizedWorkspace(auth.value.workspaceId, identifier);
		if (!workspace) {
			return json({ error: "not_found", message: "Workspace not found" }, 404, { "Cache-Control": "no-store" });
		}
		const ownerUserId = String(workspace.owner_user_id ?? "").trim();
		if (!ownerUserId) {
			throw new Error("Workspace owner not found");
		}
		// As in Settings, only the owner deletes a workspace (it deletes the wallet and every key).
		const ownerError = await requireWorkspaceOwner(auth.value, workspace, "Only the workspace owner can delete the workspace.");
		if (ownerError) return ownerError;

		const supabase = getSupabaseAdmin();
		const { data: userRow, error: userError } = await supabase
			.from("users")
			.select("default_workspace_id")
			.eq("user_id", ownerUserId)
			.maybeSingle();
		if (userError) {
			throw new Error(userError.message || "Failed to resolve default workspace");
		}
		if (String((userRow as { default_workspace_id?: unknown } | null)?.default_workspace_id ?? "").trim() === workspace.id) {
			return json({ error: "bad_request", message: "The default workspace cannot be deleted" }, 400, { "Cache-Control": "no-store" });
		}

		const { count: activeKeyCount, error: keyCountError } = await supabase
			.from("keys")
			.select("id", { count: "exact", head: true })
			.eq("workspace_id", workspace.id)
			.neq("status", "deleted");
		if (keyCountError) {
			throw new Error(keyCountError.message || "Failed to count workspace keys");
		}
		if ((activeKeyCount ?? 0) > 0) {
			return json({ error: "bad_request", message: "Workspaces with active API keys cannot be deleted" }, 400, { "Cache-Control": "no-store" });
		}

		await recordWorkspaceAuditEvent(supabase, {
			workspaceId: workspace.id,
			actorUserId: auth.value.userId,
			action: "workspace.deleted",
			targetType: "workspace",
			targetId: workspace.id,
			targetName: workspace.name,
			requestId: auth.value.requestId,
		});
		await retryTransaction(() => supabase.from("workspace_members").delete().eq("workspace_id", workspace.id));
		await supabase.from("workspace_invites").delete().eq("workspace_id", workspace.id);
		await supabase.from("workspace_join_requests").delete().eq("workspace_id", workspace.id);
		await supabase.from("workspace_settings").delete().eq("workspace_id", workspace.id);
		await supabase.from("wallets").delete().eq("workspace_id", workspace.id);
		await supabase.from("management_keys").delete().eq("workspace_id", workspace.id);
		await retryTransaction(() => supabase.from("workspaces").delete().eq("id", workspace.id).eq("owner_user_id", ownerUserId));

		return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("workspaces.delete", error);
	}
}

async function handleListWorkspaceMembers(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.WORKSPACES_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const identifier = parseWorkspaceResourceId(new URL(req.url));
	if (!identifier) {
		return json({ error: "bad_request", message: "Workspace id or slug is required" }, 400, { "Cache-Control": "no-store" });
	}
	const pagination = parsePagination(new URL(req.url));
	if (!pagination) {
		return json({ error: "bad_request", message: "offset must be non-negative and limit must be between 1 and 100" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const workspace = await resolveAuthorizedWorkspace(auth.value.workspaceId, identifier);
		if (!workspace) {
			return json({ error: "not_found", message: "Workspace not found" }, 404, { "Cache-Control": "no-store" });
		}
		const { members, totalCount } = await resolveWorkspaceMembers(workspace.id, pagination);
		return json({ data: members, total_count: totalCount }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("workspaces.members.list", error);
	}
}

async function handleAddWorkspaceMembers(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.WORKSPACES_WRITE);
	if (scopeError) return scopeError;
	// A member can create keys and spend the workspace's credits.
	const appError = rejectThirdPartyOAuthSpendingChange(auth.value, "Apps that use Sign in with Phaseo can't add members. The person can invite people under Settings, Members.");
	if (appError) return appError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const identifier = parseWorkspaceResourceId(new URL(req.url));
	if (!identifier) {
		return json({ error: "bad_request", message: "Workspace id or slug is required" }, 400, { "Cache-Control": "no-store" });
	}

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
		throw error;
	}

	const userIds = Array.isArray(body.user_ids)
		? body.user_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
		: [];
	if (!userIds.length) {
		return json({ error: "bad_request", message: "user_ids must contain at least one user id" }, 400, { "Cache-Control": "no-store" });
	}
	if (new Set(userIds).size > 100) {
		return json({ error: "bad_request", message: "user_ids cannot contain more than 100 users" }, 400, { "Cache-Control": "no-store" });
	}

	// Without a role, each person gets the role their invite was created with.
	const requestedRole = body.role == null ? null : String(body.role).trim().toLowerCase();
	if (requestedRole !== null && (!isValidWorkspaceRole(requestedRole) || requestedRole === "owner")) {
		return json({ error: "bad_request", message: "role must be admin or member" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const workspace = await resolveAuthorizedWorkspace(auth.value.workspaceId, identifier);
		if (!workspace) {
			return json({ error: "not_found", message: "Workspace not found" }, 404, { "Cache-Control": "no-store" });
		}
		const supabase = getSupabaseAdmin();
		const { data: existingUsers, error: usersError } = await supabase
			.from("users")
			.select("user_id")
			.in("user_id", userIds);
		if (usersError) {
			throw new Error(usersError.message || "Failed to validate users");
		}
		const existingUserIds = new Set((existingUsers ?? []).map((row) => String(row.user_id)));
		if (userIds.some((userId) => !existingUserIds.has(userId))) {
			return json({ error: "bad_request", message: "One or more users do not exist" }, 400, { "Cache-Control": "no-store" });
		}

		const uniqueUserIds = Array.from(new Set(userIds));
		const { data: existingMemberships, error: existingMembershipsError } = await supabase
			.from("workspace_members")
			.select("user_id")
			.eq("workspace_id", workspace.id)
			.in("user_id", uniqueUserIds);
		if (existingMembershipsError) {
			throw new Error(existingMembershipsError.message || "Failed to load existing workspace members");
		}
		// Existing members keep their role; change it with PATCH /workspaces/{id}/members/{userId}.
		const existingMemberIds = new Set((existingMemberships ?? []).map((row) => String(row.user_id)));
		const newUserIds = uniqueUserIds.filter((userId) => !existingMemberIds.has(userId));

		// People join through an invite: they accept it, which creates a join request, and an owner or
		// admin approves it. This route approves those pending requests; it never adds someone who
		// hasn't asked to join.
		const { data: pendingRequests, error: pendingError } = newUserIds.length
			? await supabase
				.from("workspace_join_requests")
				.select("id, requester_user_id, invite_id")
				.eq("workspace_id", workspace.id)
				.eq("status", "pending")
				.in("requester_user_id", newUserIds)
			: { data: [], error: null };
		if (pendingError) {
			throw new Error(pendingError.message || "Failed to load workspace join requests");
		}
		const requestByUser = new Map((pendingRequests ?? []).map((row) => [String(row.requester_user_id), String(row.id)]));
		if (newUserIds.some((userId) => !requestByUser.has(userId))) {
			return json({
				error: "bad_request",
				message: "One or more users haven't asked to join this workspace. Send them an invite (POST /workspaces/{id}/invites); once they accept it, add them here or approve their join request.",
			}, 400, { "Cache-Control": "no-store" });
		}

		// Making someone an admin is the owner's call, as in Settings, whether the admin role is asked for
		// here or comes from the invite. The approval function checks the invite's role again atomically.
		const inviteIds = (pendingRequests ?? []).map((row) => row.invite_id).filter((id): id is string => Boolean(id));
		const { data: invites, error: invitesError } = inviteIds.length
			? await supabase.from("workspace_invites").select("id, role").eq("workspace_id", workspace.id).in("id", inviteIds)
			: { data: [], error: null };
		if (invitesError) throw new Error(invitesError.message || "Failed to load workspace invites");
		// The effective role is the one asked for here, otherwise the invite's.
		const grantsAdmin = requestedRole
			? requestedRole === "admin"
			: (invites ?? []).some((invite) => String(invite.role ?? "").toLowerCase() === "admin");
		if (grantsAdmin) {
			const ownerError = await requireWorkspaceOwner(auth.value, workspace, "Only the workspace owner can add admins, including people whose invite makes them an admin.");
			if (ownerError) return ownerError;
		}

		const decidedBy = String(auth.value.userId ?? workspace.owner_user_id ?? "").trim();
		if (!decidedBy) throw new Error("Workspace actor could not be resolved");
		const inviteRoleById = new Map((invites ?? []).map((invite) => [String(invite.id), String(invite.role ?? "").toLowerCase()]));
		const inviteByUser = new Map((pendingRequests ?? []).map((row) => [String(row.requester_user_id), row.invite_id ? String(row.invite_id) : null]));
		// Each approval is its own transaction, so a later failure doesn't undo earlier ones. The response
		// says who was approved, who failed and who wasn't tried, and every committed approval is audited.
		const approved: string[] = [];
		// Flat (user_id, code, message): every generated SDK can hold it, including a string map.
		const failed: Array<{ user_id: string; code: string; message: string }> = [];
		let notAttempted: string[] = [];
		for (const [index, userId] of newUserIds.entries()) {
			const { error: approveError } = await retryTransaction(() => supabase.rpc("management_decide_workspace_join_request", {
				p_workspace_id: workspace.id,
				p_request_id: requestByUser.get(userId),
				p_decision: "approve",
				p_actor_user_id: decidedBy,
				// The role is applied inside the approval, in one transaction: approving with the invite's
				// role and changing it in a second call could leave the invite's role if that call failed.
				p_role: requestedRole,
			}));
			if (approveError) {
				failed.push({ user_id: userId, ...approvalFailure(approveError) });
				notAttempted = newUserIds.slice(index + 1);
				break;
			}
			approved.push(userId);
			// The same role the approval function gives: the one asked for, otherwise the invite's.
			const inviteId = inviteByUser.get(userId);
			const role = requestedRole ?? (inviteId ? inviteRoleById.get(inviteId) : undefined) ?? "member";
			await recordWorkspaceAuditEvent(supabase, {
				workspaceId: workspace.id,
				actorUserId: auth.value.userId,
				action: "workspace.member.added",
				targetType: "workspace_member",
				targetId: userId,
				metadata: { role },
				requestId: auth.value.requestId,
			});
		}

		// The approvals above are committed and audited, so the outcome is reported even if reading the
		// added members back fails; only the optional member details (data) are left out then.
		const added = await resolveWorkspaceMembers(workspace.id)
			.then(({ members }) => members.filter((member) => approved.includes(String(member.user_id))))
			.catch((error: unknown) => {
				console.error("workspaces.members.add.readback_failed", { message: error instanceof Error ? error.message : String(error) });
				return null;
			});
		const results = { added_count: approved.length, ...(added ? { data: added } : {}), approved, failed, not_attempted: notAttempted };
		if (failed.length) {
			const notTried = notAttempted.length ? ` Not tried: ${notAttempted.join(", ")}.` : "";
			const message = `Added ${approved.length} of ${newUserIds.length} users. ${failed[0].user_id} couldn't be added: ${failed[0].message}${notTried}`;
			return json({ error: "conflict", message, ...results }, 409, { "Cache-Control": "no-store" });
		}
		return json(results, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("workspaces.members.add", error);
	}
}

function approvalFailure(error: { code?: string; message?: string }) {
	if (error.code === "42501") return { code: "forbidden", message: "Only the workspace owner can add admins." };
	if (error.code === "23514") return { code: "conflict", message: error.message || "The join request can't be approved." };
	console.error("workspaces.members.add.approval_failed", { code: error.code ?? null });
	return { code: "internal_error", message: "The join request couldn't be approved. Try again." };
}

async function handleRemoveWorkspaceMembers(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.WORKSPACES_WRITE);
	if (scopeError) return scopeError;

	const identifier = parseWorkspaceResourceId(new URL(req.url));
	if (!identifier) {
		return json({ error: "bad_request", message: "Workspace id or slug is required" }, 400, { "Cache-Control": "no-store" });
	}

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
		throw error;
	}

	const userIds = Array.isArray(body.user_ids)
		? Array.from(new Set(body.user_ids.map((value) => String(value ?? "").trim()).filter(Boolean)))
		: [];
	if (!userIds.length) {
		return json({ error: "bad_request", message: "user_ids must contain at least one user id" }, 400, { "Cache-Control": "no-store" });
	}
	if (userIds.length > 100) {
		return json({ error: "bad_request", message: "user_ids cannot contain more than 100 users" }, 400, { "Cache-Control": "no-store" });
	}
	// As in Settings: anyone may leave, but only the owner removes someone else. Removing a member
	// revokes the keys they created, so an admin must not be able to remove another admin.
	const callerUserId = String(auth.value.userId ?? "").trim();
	const leavingOnly = Boolean(callerUserId) && userIds.length === 1 && userIds[0] === callerUserId;
	const roleError = await requireOAuthWorkspaceRole(
		auth.value,
		auth.value.workspaceId,
		leavingOnly ? ["owner", "admin", "member"] : ["owner", "admin"],
	);
	if (roleError) return roleError;

	try {
		const workspace = await resolveAuthorizedWorkspace(auth.value.workspaceId, identifier);
		if (!workspace) {
			return json({ error: "not_found", message: "Workspace not found" }, 404, { "Cache-Control": "no-store" });
		}
		const ownerUserId = String(workspace.owner_user_id ?? "").trim();
		if (!ownerUserId) {
			throw new Error("Workspace owner not found");
		}
		if (userIds.includes(ownerUserId)) {
			return json({ error: "bad_request", message: "Workspace owner cannot be removed" }, 400, { "Cache-Control": "no-store" });
		}
		if (!leavingOnly) {
			const ownerError = await requireWorkspaceOwner(auth.value, workspace, "Only the workspace owner can remove other members. You can remove yourself.");
			if (ownerError) return ownerError;
		}

		const supabase = getSupabaseAdmin();
		const { data: existingMembers, error: membersError } = await supabase
			.from("workspace_members")
			.select("user_id, role")
			.eq("workspace_id", workspace.id)
			.in("user_id", userIds);
		if (membersError) {
			throw new Error(membersError.message || "Failed to load workspace members");
		}
		if ((existingMembers ?? []).some((member) => String(member.role ?? "").toLowerCase() === "owner")) {
			return json({ error: "bad_request", message: "Workspace owner cannot be removed" }, 400, { "Cache-Control": "no-store" });
		}

		const { error: deleteError, count } = await retryTransaction(() => supabase
			.from("workspace_members")
			.delete({ count: "exact" })
			.eq("workspace_id", workspace.id)
			.in("user_id", userIds));
		if (deleteError) {
			throw new Error(deleteError.message || "Failed to remove workspace members");
		}
		for (const member of existingMembers ?? []) {
			await recordWorkspaceAuditEvent(supabase, {
				workspaceId: workspace.id,
				actorUserId: auth.value.userId,
				action: "workspace.member.removed",
				targetType: "workspace_member",
				targetId: String(member.user_id),
				requestId: auth.value.requestId,
			});
		}

		return json({ removed_count: count ?? 0 }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("workspaces.members.remove", error);
	}
}

export const workspacesRoutes = new Hono<Env>();

workspacesRoutes.get("/", withRuntime(handleListWorkspaces));
workspacesRoutes.post("/", withRuntime(handleCreateWorkspace));
workspacesRoutes.get("/:id", withRuntime(handleGetWorkspace));
workspacesRoutes.patch("/:id", withRuntime(handleUpdateWorkspace));
workspacesRoutes.delete("/:id", withRuntime(handleDeleteWorkspace));
workspacesRoutes.get("/:id/members", withRuntime(handleListWorkspaceMembers));
workspacesRoutes.post("/:id/members/add", withRuntime(handleAddWorkspaceMembers));
workspacesRoutes.post("/:id/members/remove", withRuntime(handleRemoveWorkspaceMembers));
