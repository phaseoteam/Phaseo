// Purpose: Workspace control-plane routes.
// Why: Exposes elevated workspace lifecycle operations behind management-key auth.
// How: Resolves the current workspace owner from the management key and scopes CRUD to that owner.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { json, withRuntime } from "@/routes/utils";
import { internalServerError, requireCapability, requireOAuthWorkspaceRole } from "./route-helpers";
import { ensureWorkspaceWalletProvisioned, userHasPaidWorkspaceAccess } from "./management-helpers";

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

async function resolveAuthorizedWorkspace(authWorkspaceId: string, identifier: string): Promise<WorkspaceRow | null> {
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
		await supabase.from("workspace_members").delete().eq("workspace_id", workspaceId),
		await supabase.from("wallets").delete().eq("workspace_id", workspaceId),
		await supabase.from("management_keys").delete().eq("workspace_id", workspaceId),
		await supabase.from("workspaces").delete().eq("id", workspaceId).eq("owner_user_id", ownerUserId),
	];
	const failed = cleanupResults.find((result) => result?.error);
	if (failed?.error) {
		throw new Error(failed.error.message || "Failed to roll back workspace after provisioning error");
	}
}

async function resolveWorkspaceMembers(workspaceId: string) {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("workspace_members")
		.select("workspace_id, user_id, role, joined_at")
		.eq("workspace_id", workspaceId)
		.order("joined_at", { ascending: true });
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
	return (data ?? []).map((row) => ({
		workspace_id: row.workspace_id,
		user_id: row.user_id,
		role: row.role,
		joined_at: (row as { joined_at?: string | null }).joined_at ?? null,
		display_name: usersById.get(String(row.user_id))?.display_name ?? null,
	}));
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
		if (message.includes("Stripe customer provisioning is not configured")) {
			return json(
				{ error: "stripe_not_configured", message },
				503,
				{ "Cache-Control": "no-store" },
			);
		}
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
			const memberResult = await supabase
				.from("workspace_members")
				.upsert(
					{ workspace_id: workspaceId, user_id: ownerUserId, role: "owner" },
					{ onConflict: "workspace_id,user_id", ignoreDuplicates: true },
				);
			assertSupabaseWrite(memberResult, "Failed to create workspace owner membership");
			await ensureWorkspaceWalletProvisioned({
				workspaceId,
				userId: ownerUserId,
			});
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

		return json({ data: formatWorkspace(data as WorkspaceRow) }, 201, { "Cache-Control": "no-store" });
	} catch (error: any) {
		const message = String(error?.message ?? error);
		if (message.includes("Stripe customer provisioning is not configured")) {
			return json(
				{ error: "stripe_not_configured", message },
				503,
				{ "Cache-Control": "no-store" },
			);
		}
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

		await supabase.from("workspace_members").delete().eq("workspace_id", workspace.id);
		await supabase.from("workspace_invites").delete().eq("workspace_id", workspace.id);
		await supabase.from("workspace_join_requests").delete().eq("workspace_id", workspace.id);
		await supabase.from("workspace_settings").delete().eq("workspace_id", workspace.id);
		await supabase.from("wallets").delete().eq("workspace_id", workspace.id);
		await supabase.from("management_keys").delete().eq("workspace_id", workspace.id);
		await supabase.from("workspaces").delete().eq("id", workspace.id).eq("owner_user_id", ownerUserId);

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

	try {
		const workspace = await resolveAuthorizedWorkspace(auth.value.workspaceId, identifier);
		if (!workspace) {
			return json({ error: "not_found", message: "Workspace not found" }, 404, { "Cache-Control": "no-store" });
		}
		const members = await resolveWorkspaceMembers(workspace.id);
		return json({ data: members, total_count: members.length }, 200, { "Cache-Control": "no-store" });
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

	const requestedRole = String(body.role ?? "member").trim().toLowerCase();
	if (!isValidWorkspaceRole(requestedRole) || requestedRole === "owner") {
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

		const payload = Array.from(new Set(userIds)).map((userId) => ({
			workspace_id: workspace.id,
			user_id: userId,
			role: requestedRole,
		}));
		const { error: upsertError } = await supabase
			.from("workspace_members")
			.upsert(payload, { onConflict: "workspace_id,user_id", ignoreDuplicates: false });
		if (upsertError) {
			throw new Error(upsertError.message || "Failed to add workspace members");
		}

		const members = await resolveWorkspaceMembers(workspace.id);
		const added = members.filter((member) => payload.some((entry) => entry.user_id === member.user_id));
		return json({ added_count: added.length, data: added }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("workspaces.members.add", error);
	}
}

async function handleRemoveWorkspaceMembers(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.WORKSPACES_WRITE);
	if (scopeError) return scopeError;
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
		? Array.from(new Set(body.user_ids.map((value) => String(value ?? "").trim()).filter(Boolean)))
		: [];
	if (!userIds.length) {
		return json({ error: "bad_request", message: "user_ids must contain at least one user id" }, 400, { "Cache-Control": "no-store" });
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
		if (userIds.includes(ownerUserId)) {
			return json({ error: "bad_request", message: "Workspace owner cannot be removed" }, 400, { "Cache-Control": "no-store" });
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

		const { error: deleteError, count } = await supabase
			.from("workspace_members")
			.delete({ count: "exact" })
			.eq("workspace_id", workspace.id)
			.in("user_id", userIds);
		if (deleteError) {
			throw new Error(deleteError.message || "Failed to remove workspace members");
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
