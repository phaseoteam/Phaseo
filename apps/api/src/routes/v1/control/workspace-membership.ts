// Purpose: Workspace membership, invite, and join-request management routes.
// Why: Makes durable team administration available without dashboard automation.
// How: Reuses management-key capabilities and workspace roles, with atomic decisions and audit events.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { json, withRuntime } from "@/routes/utils";
import { internalServerError, requireCapability, requireOAuthWorkspaceRole, rejectThirdPartyOAuthSpendingChange } from "./route-helpers";
import { resolveAuthorizedWorkspace } from "./workspaces";

const NO_STORE = { "Cache-Control": "no-store" };
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

type ManagementAuth = Extract<Awaited<ReturnType<typeof guardManagementAuth>>, { ok: true }>["value"];

function resourceId(url: URL, marker: string): string | null {
	const segments = url.pathname.split("/").filter(Boolean);
	const index = segments.lastIndexOf(marker);
	const value = index >= 0 ? segments[index + 1] : marker === "workspaces" ? segments[0] : null;
	return value ? decodeURIComponent(value).trim() || null : null;
}

function pagination(url: URL): { offset: number; limit: number } | null {
	const offset = Number(url.searchParams.get("offset") ?? "0");
	const limit = Number(url.searchParams.get("limit") ?? "100");
	if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) return null;
	return { offset, limit };
}

function base64ToBytes(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function bytesToBase64(value: Uint8Array): string {
	let binary = "";
	for (const byte of value) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function bytesBuffer(value: Uint8Array): ArrayBuffer {
	return new Uint8Array(value).buffer;
}

function generateInviteToken(length = 20): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(bytes, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join("");
}

async function inviteAesKey() {
	const bytes = base64ToBytes(getBindings().INVITE_ENCRYPTION_KEY ?? "");
	if (bytes.length !== 32) throw new Error("invite_encryption_unavailable");
	return crypto.subtle.importKey("raw", bytesBuffer(bytes), { name: "AES-GCM" }, false, ["encrypt"]);
}

async function encryptInviteToken(token: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = new Uint8Array(await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv, tagLength: 128 },
		await inviteAesKey(),
		new TextEncoder().encode(token),
	));
	const ciphertext = encrypted.slice(0, -16);
	const tag = encrypted.slice(-16);
	const output = new Uint8Array(iv.length + tag.length + ciphertext.length);
	output.set(iv, 0);
	output.set(tag, iv.length);
	output.set(ciphertext, iv.length + tag.length);
	return bytesToBase64(output);
}

export async function inviteFingerprint(token: string): Promise<string> {
	const keyBytes = base64ToBytes(getBindings().HMAC_ENCRYPTION_KEY ?? "");
	if (!keyBytes.length) throw new Error("invite_hmac_unavailable");
	const key = await crypto.subtle.importKey("raw", bytesBuffer(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)));
	return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticateWorkspace(req: Request, capability: string, roles: Array<"owner" | "admin">) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response } as const;
	const scopeError = requireCapability(auth.value, capability);
	if (scopeError) return { response: scopeError } as const;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, roles);
	if (roleError) return { response: roleError } as const;
	const identifier = resourceId(new URL(req.url), "workspaces");
	if (!identifier) return { response: json({ error: "bad_request", message: "Workspace id or slug is required" }, 400, NO_STORE) } as const;
	const workspace = await resolveAuthorizedWorkspace(auth.value.workspaceId, identifier);
	if (!workspace) return { response: json({ error: "not_found", message: "Workspace not found" }, 404, NO_STORE) } as const;
	return { auth: auth.value, workspace } as const;
}

async function actorUserId(auth: ManagementAuth, ownerUserId: string | null): Promise<string> {
	const actor = String(auth.userId ?? ownerUserId ?? "").trim();
	if (!actor) throw new Error("Workspace actor could not be resolved");
	return actor;
}

async function handleUpdateMemberRole(req: Request) {
	try {
		const access = await authenticateWorkspace(req, CAPABILITIES.WORKSPACES_WRITE, ["owner"]);
		if ("response" in access) return access.response;
		// A member can create keys and spend the workspace's credits, so apps can't hand out roles.
		const appError = rejectThirdPartyOAuthSpendingChange(access.auth, "Apps that use Sign in with Phaseo can't change members' roles. The person can change them under Settings, Members.");
		if (appError) return appError;
		const userId = resourceId(new URL(req.url), "members");
		if (!userId) return json({ error: "bad_request", message: "Member user id is required" }, 400, NO_STORE);
		const body = await req.json<Record<string, unknown>>().catch(() => null);
		if (!body) return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, NO_STORE);
		const role = String(body.role ?? "").trim().toLowerCase();
		if (role !== "admin" && role !== "member") return json({ error: "bad_request", message: "role must be admin or member" }, 400, NO_STORE);
		if (userId === String(access.workspace.owner_user_id ?? "")) return json({ error: "conflict", message: "Workspace owner role cannot be changed" }, 409, NO_STORE);

		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase.from("workspace_members")
			.update({ role })
			.eq("workspace_id", access.workspace.id)
			.eq("user_id", userId)
			.select("workspace_id,user_id,role,joined_at")
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to update workspace member");
		if (!data) return json({ error: "not_found", message: "Workspace member not found" }, 404, NO_STORE);
		await recordWorkspaceAuditEvent(supabase, {
			workspaceId: access.workspace.id,
			actorUserId: access.auth.userId,
			action: "workspace.member.role_updated",
			targetType: "workspace_member",
			targetId: userId,
			metadata: { role },
			requestId: access.auth.requestId,
		});
		return json({ data }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("workspaces.members.update", error);
	}
}

async function handleListInvites(req: Request) {
	try {
		const access = await authenticateWorkspace(req, CAPABILITIES.WORKSPACES_READ, ["owner", "admin"]);
		if ("response" in access) return access.response;
		const page = pagination(new URL(req.url));
		if (!page) return json({ error: "bad_request", message: "offset must be non-negative and limit must be between 1 and 100" }, 400, NO_STORE);
		const supabase = getSupabaseAdmin();
		const { data, error, count } = await supabase.from("workspace_invites")
			.select("id,workspace_id,creator_user_id,role,token_preview,expires_at,max_uses,uses_count,created_at", { count: "exact" })
			.eq("workspace_id", access.workspace.id)
			.order("created_at", { ascending: false })
			.range(page.offset, page.offset + page.limit - 1);
		if (error) throw new Error(error.message || "Failed to list workspace invites");
		return json({ data: data ?? [], total_count: count ?? data?.length ?? 0 }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("workspaces.invites.list", error);
	}
}

async function handleCreateInvite(req: Request) {
	try {
		const access = await authenticateWorkspace(req, CAPABILITIES.WORKSPACES_WRITE, ["owner", "admin"]);
		if ("response" in access) return access.response;
		const appError = rejectThirdPartyOAuthSpendingChange(access.auth, "Apps that use Sign in with Phaseo can't invite members. The person can invite people under Settings, Members.");
		if (appError) return appError;
		const body = await req.json<Record<string, unknown>>().catch(() => null);
		if (!body) return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, NO_STORE);
		const role = String(body.role ?? "member").trim().toLowerCase();
		if (role !== "admin" && role !== "member") return json({ error: "bad_request", message: "role must be admin or member" }, 400, NO_STORE);
		const expiresInDays = body.expires_in_days == null ? 7 : Number(body.expires_in_days);
		if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) return json({ error: "bad_request", message: "expires_in_days must be an integer between 1 and 365" }, 400, NO_STORE);
		const maxUses = body.max_uses == null ? null : Number(body.max_uses);
		if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1_000_000)) return json({ error: "bad_request", message: "max_uses must be null or an integer between 1 and 1000000" }, 400, NO_STORE);

		const token = generateInviteToken();
		const creatorUserId = await actorUserId(access.auth, access.workspace.owner_user_id);
		const supabase = getSupabaseAdmin();
		const payload = {
			workspace_id: access.workspace.id,
			creator_user_id: creatorUserId,
			role,
			token_encrypted: await encryptInviteToken(token),
			token_fingerprint: await inviteFingerprint(token),
			token_preview: `${token.slice(0, 2)}...${token.slice(-2)}`,
			expires_at: new Date(Date.now() + expiresInDays * 86_400_000).toISOString(),
			max_uses: maxUses,
			key_version: 1,
		};
		const { data, error } = await supabase.from("workspace_invites").insert(payload)
			.select("id,workspace_id,creator_user_id,role,token_preview,expires_at,max_uses,uses_count,created_at")
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to create workspace invite");
		if (!data?.id) throw new Error("Invite creation returned no id");
		await recordWorkspaceAuditEvent(supabase, {
			workspaceId: access.workspace.id,
			actorUserId: access.auth.userId,
			action: "workspace.invite.created",
			targetType: "workspace_invite",
			targetId: String(data.id),
			metadata: { role, expires_in_days: expiresInDays, max_uses: maxUses },
			requestId: access.auth.requestId,
		});
		return json({ data, token }, 201, NO_STORE);
	} catch (error) {
		return internalServerError("workspaces.invites.create", error);
	}
}

async function handleDeleteInvite(req: Request) {
	try {
		const access = await authenticateWorkspace(req, CAPABILITIES.WORKSPACES_WRITE, ["owner", "admin"]);
		if ("response" in access) return access.response;
		const inviteId = resourceId(new URL(req.url), "invites");
		if (!inviteId) return json({ error: "bad_request", message: "Invite id is required" }, 400, NO_STORE);
		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase.from("workspace_invites").delete()
			.eq("workspace_id", access.workspace.id)
			.eq("id", inviteId)
			.select("id")
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to delete workspace invite");
		if (!data) return json({ error: "not_found", message: "Workspace invite not found" }, 404, NO_STORE);
		await recordWorkspaceAuditEvent(supabase, {
			workspaceId: access.workspace.id,
			actorUserId: access.auth.userId,
			action: "workspace.invite.deleted",
			targetType: "workspace_invite",
			targetId: inviteId,
			requestId: access.auth.requestId,
		});
		return json({ deleted: true }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("workspaces.invites.delete", error);
	}
}

async function handleListJoinRequests(req: Request) {
	try {
		const access = await authenticateWorkspace(req, CAPABILITIES.WORKSPACES_READ, ["owner", "admin"]);
		if ("response" in access) return access.response;
		const url = new URL(req.url);
		const page = pagination(url);
		if (!page) return json({ error: "bad_request", message: "offset must be non-negative and limit must be between 1 and 100" }, 400, NO_STORE);
		const status = url.searchParams.get("status")?.trim().toLowerCase();
		if (status && !["pending", "approved", "denied"].includes(status)) return json({ error: "bad_request", message: "status must be pending, approved, or denied" }, 400, NO_STORE);
		const supabase = getSupabaseAdmin();
		let query = supabase.from("workspace_join_requests")
			.select("id,workspace_id,requester_user_id,invite_id,status,created_at,decided_at,decided_by", { count: "exact" })
			.eq("workspace_id", access.workspace.id)
			.order("created_at", { ascending: false })
			.range(page.offset, page.offset + page.limit - 1);
		if (status) query = query.eq("status", status);
		const { data, error, count } = await query;
		if (error) throw new Error(error.message || "Failed to list workspace join requests");
		return json({ data: data ?? [], total_count: count ?? data?.length ?? 0 }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("workspaces.join_requests.list", error);
	}
}

async function handleDecideJoinRequest(req: Request, decision: "approve" | "reject") {
	try {
		const access = await authenticateWorkspace(req, CAPABILITIES.WORKSPACES_WRITE, ["owner", "admin"]);
		if ("response" in access) return access.response;
		const appError = decision === "approve"
			? rejectThirdPartyOAuthSpendingChange(access.auth, "Apps that use Sign in with Phaseo can't approve join requests. The person can approve them under Settings, Members.")
			: null;
		if (appError) return appError;
		const requestId = resourceId(new URL(req.url), "join-requests");
		if (!requestId) return json({ error: "bad_request", message: "Join request id is required" }, 400, NO_STORE);
		const decidedBy = await actorUserId(access.auth, access.workspace.owner_user_id);
		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase.rpc("management_decide_workspace_join_request", {
			p_workspace_id: access.workspace.id,
			p_request_id: requestId,
			p_decision: decision,
			p_actor_user_id: decidedBy,
		});
		if (error) {
			if (error.code === "P0002") return json({ error: "not_found", message: "Join request not found" }, 404, NO_STORE);
			if (error.code === "23514") return json({ error: "conflict", message: error.message }, 409, NO_STORE);
			throw new Error(error.message || "Failed to decide workspace join request");
		}
		const row = Array.isArray(data) ? data[0] : data;
		if (!row?.id) return json({ error: "not_found", message: "Join request not found" }, 404, NO_STORE);
		await recordWorkspaceAuditEvent(supabase, {
			workspaceId: access.workspace.id,
			actorUserId: access.auth.userId,
			action: `workspace.join_request.${decision === "approve" ? "approved" : "rejected"}`,
			targetType: "workspace_join_request",
			targetId: requestId,
			metadata: { requester_user_id: row.requester_user_id ?? null },
			requestId: access.auth.requestId,
		});
		return json({ data: row }, 200, NO_STORE);
	} catch (error) {
		return internalServerError(`workspaces.join_requests.${decision}`, error);
	}
}

export const workspaceMembershipRoutes = new Hono<Env>();

workspaceMembershipRoutes.patch("/:id/members/:userId", withRuntime(handleUpdateMemberRole));
workspaceMembershipRoutes.get("/:id/invites", withRuntime(handleListInvites));
workspaceMembershipRoutes.post("/:id/invites", withRuntime(handleCreateInvite));
workspaceMembershipRoutes.delete("/:id/invites/:inviteId", withRuntime(handleDeleteInvite));
workspaceMembershipRoutes.get("/:id/join-requests", withRuntime(handleListJoinRequests));
workspaceMembershipRoutes.post("/:id/join-requests/:requestId/approve", withRuntime((req) => handleDecideJoinRequest(req, "approve")));
workspaceMembershipRoutes.post("/:id/join-requests/:requestId/reject", withRuntime((req) => handleDecideJoinRequest(req, "reject")));
