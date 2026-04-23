"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import upsertLinearCustomer from "@/lib/linear";
import { ensureWorkspaceStripeWallet } from "@/lib/server/activeTeamStripe";
import { userHasPaidTeamAccess } from "@/lib/server/teamLimits";
import {
	normalizeTeamSsoSettingsInput,
	type TeamSsoSettingsInput,
	type TeamSsoSettingsRow,
} from "@/lib/auth/teamSsoSettings";
import crypto from "crypto";

function makeSlug(name: string) {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 42);
    try {
        const ts = Date.now();
        const SECRET = 0x9e3779b9;
        const ob = (ts ^ SECRET) >>> 0;
        const suffix = ob.toString(36);
        return `${base}-${suffix}`.slice(0, 50);
    } catch {
        return base.slice(0, 50);
    }
}

function deriveWorkspaceOwnerName(user: {
	email?: string | null;
	user_metadata?: Record<string, unknown>;
}) {
	const meta = user.user_metadata ?? {};
	const fromMeta =
		(typeof meta.full_name === "string" && meta.full_name.trim()) ||
		(typeof meta.name === "string" && meta.name.trim()) ||
		null;
	if (fromMeta) return fromMeta;
	const emailLocal = user.email?.split("@")[0]?.trim();
	return emailLocal || "Workspace Owner";
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWorkspaceWalletForeignKeyError(error: unknown): boolean {
	const message = String((error as { message?: unknown } | null)?.message ?? "");
	return (
		message.includes("wallets_workspace_id_fkey") ||
		(message.includes("workspace_id") &&
			message.includes("not present in table \"workspaces\""))
	);
}

async function ensureWorkspaceRowVisible(
	admin: ReturnType<typeof createAdminClient>,
	workspaceId: string,
) {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const { data, error } = await admin
			.from("workspaces")
			.select("id")
			.eq("id", workspaceId)
			.maybeSingle();
		if (!error && data?.id) return;
		await sleep(150 * (attempt + 1));
	}
}

async function ensureWorkspaceWalletWithRetry(args: {
	admin: ReturnType<typeof createAdminClient>;
	workspaceId: string;
	userId: string;
	email?: string;
	name: string;
}) {
	await ensureWorkspaceRowVisible(args.admin, args.workspaceId);

	for (let attempt = 0; attempt < 4; attempt += 1) {
		try {
			await ensureWorkspaceStripeWallet({
				workspaceId: args.workspaceId,
				userId: args.userId,
				email: args.email,
				name: args.name,
			});
			return;
		} catch (error) {
			if (!isWorkspaceWalletForeignKeyError(error) || attempt === 3) {
				throw error;
			}
			await sleep(200 * (attempt + 1));
		}
	}
}

// ---- Crypto helpers (sync for simplicity; server actions await their callers) ----
function getInviteKey(): Buffer {
    const keyB64 = process.env.INVITE_ENCRYPTION_KEY || ""; // base64 of 32 bytes
    const key = Buffer.from(keyB64, "base64");
    if (key.length !== 32) throw new Error("INVITE_ENCRYPTION_KEY must be base64-encoded 32 bytes");
    return key;
}

function encryptTokenGCM(token: string): string {
    const key = getInviteKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString("base64");
}

function decryptTokenGCM(payloadBase64: string): string {
    const key = getInviteKey();
    const buf = Buffer.from(payloadBase64, "base64");
    if (buf.length < 12 + 16 + 1) throw new Error("Malformed encrypted token");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
}

function hmacHex(token: string): string {
    const b64 = process.env.HMAC_ENCRYPTION_KEY || ""; // base64 key (~32 bytes)
    const key = Buffer.from(b64, "base64");
    if (!key.length) throw new Error("Missing HMAC_ENCRYPTION_KEY (base64)");
    return crypto.createHmac("sha256", key).update(token, "utf8").digest("hex");
}

function previewFromToken(token: string) {
    return token.length >= 4 ? token.slice(0, 2) + "..." + token.slice(-2) : token;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function ensureNotPersonalTeam(
    supabase: SupabaseClient,
    userId: string,
    workspaceId: string,
    message: string,
) {
    const { data: userRow, error } = await supabase
        .from("users")
        .select("default_workspace_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) throw error;
    if (userRow?.default_workspace_id === workspaceId) {
        throw new Error(message);
    }
}

async function ensureTeamOwnerOrAdmin(
    supabase: SupabaseClient,
    userId: string,
    workspaceId: string,
    message = "Unauthorized",
) {
    const { data: membership, error } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle();

    if (error) throw error;

    if (!membership) {
        throw new Error(message);
    }

    const role = (membership.role ?? "").toLowerCase();
    if (role !== "owner" && role !== "admin") {
        throw new Error(message);
    }
}

function toTeamSsoSettingsResponse(
	row: TeamSsoSettingsRow | null | undefined,
): TeamSsoSettingsRow {
	return {
		sso_enabled: Boolean(row?.sso_enabled),
		sso_enforced: Boolean(row?.sso_enforced),
		sso_mode: String(row?.sso_mode ?? "none"),
		sso_provider_identifier: row?.sso_provider_identifier ?? null,
		sso_domains: Array.isArray(row?.sso_domains) ? row!.sso_domains : [],
	};
}

function revalidateWorkspacePaths() {
	revalidatePath("/settings/workspaces");
	revalidatePath("/settings/workspaces/general");
	revalidatePath("/settings/workspaces/access");
	revalidatePath("/settings/workspaces/members");
	revalidatePath("/settings/workspaces/settings");
}

export async function getTeamSsoSettingsAction(workspaceId: string) {
	if (!workspaceId || typeof workspaceId !== "string") {
		throw new Error("Missing workspaceId");
	}

	const supabase = await createClient();
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	if (authError || !user?.id) throw new Error("Unauthorized");

	await ensureTeamOwnerOrAdmin(
		supabase,
		user.id,
		workspaceId,
		"Only owners or admins may view SSO settings.",
	);

	const { data, error } = await supabase
		.from("workspace_settings")
		.select(
			"sso_enabled,sso_enforced,sso_mode,sso_provider_identifier,sso_domains",
		)
		.eq("workspace_id", workspaceId)
		.maybeSingle();

	if (error) throw error;

	return toTeamSsoSettingsResponse(data as TeamSsoSettingsRow | null);
}

export async function updateTeamSsoSettingsAction(
	workspaceId: string,
	input: TeamSsoSettingsInput,
) {
	if (!workspaceId || typeof workspaceId !== "string") {
		throw new Error("Missing workspaceId");
	}

	const supabase = await createClient();
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	if (authError || !user?.id) throw new Error("Unauthorized");

	await ensureTeamOwnerOrAdmin(
		supabase,
		user.id,
		workspaceId,
		"Only owners or admins may update SSO settings.",
	);

	const normalized = normalizeTeamSsoSettingsInput(input);

	const payload = {
		workspace_id: workspaceId,
		sso_enabled: normalized.ssoEnabled,
		sso_enforced: normalized.ssoEnforced,
		sso_mode: normalized.ssoMode,
		sso_provider_identifier: normalized.ssoProviderIdentifier,
		sso_domains: normalized.ssoDomains,
		updated_at: new Date().toISOString(),
	};

	const { error } = await supabase
		.from("workspace_settings")
		.upsert(payload, { onConflict: "workspace_id" });
	if (error) throw error;

	revalidateWorkspacePaths();
	return { success: true as const, workspaceId, settings: toTeamSsoSettingsResponse(payload) };
}

export async function createTeamAction(name: string, userId: string) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.id) throw new Error("Unauthorized");
    if (user.id !== userId) throw new Error("Unauthorized");

    const admin = createAdminClient();
    const hasPaidTeamAccess = await userHasPaidTeamAccess(admin as any, userId);
    if (!hasPaidTeamAccess) {
        throw new Error(
            "Additional workspaces unlock after your first credit deposit. Free accounts can use the personal workspace only."
        );
    }

    const baseSlug = makeSlug(name);

    const { data, error } = await supabase
        .from("workspaces")
        .insert({ name, slug: baseSlug, owner_user_id: userId })
        .select("id")
        .single();

    if (error) throw error;
    const newTeamId = data?.id as string;

    await supabase
        .from("workspace_members")
        .upsert({ workspace_id: newTeamId, user_id: userId, role: "owner" }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });

    await ensureWorkspaceWalletWithRetry({
        admin,
        workspaceId: newTeamId,
        userId,
        email: user.email ?? undefined,
        name: deriveWorkspaceOwnerName(user),
    });

    // Upsert a Linear Customer for this workspace. Non-blocking: failures shouldn't block team creation.
    try {
        // Build an external id so we can reference this customer later
        const externalId = `cus-${newTeamId}`;
        // Read starter tier id from env if present
        const tierId = process.env.LINEAR_DEFAULT_TIER_ID!;

        await upsertLinearCustomer({ externalId, name, tierId });
    } catch (err) {
        // Do not throw; just log so team creation isn't impacted by Linear failures
        try {
            // eslint-disable-next-line no-console
            console.error('[LINEAR] failed to upsert customer for team', newTeamId, err);
        } catch { }
    }

    revalidateWorkspacePaths();
    return { id: newTeamId };
}

export async function updateTeamAction(workspaceId: string, name: string) {
    if (!workspaceId || typeof workspaceId !== "string") throw new Error("Missing workspaceId");
    if (!name || typeof name !== "string") throw new Error("Missing name");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("Unauthorized");
    await ensureNotPersonalTeam(
        supabase,
        user.id,
        workspaceId,
        "Personal workspace cannot be renamed."
    );
    const { data, error } = await supabase.from("workspaces").update({ name }).eq("id", workspaceId).select("id").single();
    if (error) throw error;

    revalidateWorkspacePaths();
    return { id: data?.id as string };
}

export async function deleteTeamAction(workspaceId: string) {
    if (!workspaceId || typeof workspaceId !== "string") throw new Error("Missing workspaceId");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("Unauthorized");

    await ensureNotPersonalTeam(
        supabase,
        user.id,
        workspaceId,
        "Personal workspace cannot be deleted."
    );

    const { data: team } = await supabase.from("workspaces").select("id, owner_user_id").eq("id", workspaceId).maybeSingle();
    if (!team) throw new Error("Workspace not found");
    if (team.owner_user_id !== user.id) throw new Error("Only the owner may delete a workspace");

    const admin = createAdminClient();
    await admin.from("workspace_members").delete().eq("workspace_id", workspaceId);
    await admin.from("workspace_invites").delete().eq("workspace_id", workspaceId);
    await admin.from("workspace_join_requests").delete().eq("workspace_id", workspaceId);
    await admin.from("workspaces").delete().eq("id", workspaceId);

    revalidateWorkspacePaths();
    return { success: true } as const;
}

export async function createTeamInviteAction(
    workspaceId: string,
    creatorUserId: string,
    role: string,
    token: string,
    expiresInDays = 7,
    maxUses?: number | null,
) {
    if (!workspaceId) throw new Error("Missing workspaceId");
    if (!creatorUserId) throw new Error("Missing creatorUserId");
    if (!token || token.length < 6) throw new Error("Invalid token");

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.id) throw new Error("Unauthorized");
    if (creatorUserId !== user.id) throw new Error("Unauthorized");
    await ensureTeamOwnerOrAdmin(
        supabase,
        user.id,
        workspaceId,
        "Only workspace owners or admins may create invites."
    );

    const normalizedRole = String(role || "member").toLowerCase();
    if (!["admin", "member"].includes(normalizedRole)) {
        throw new Error("Invalid role");
    }

    const admin = createAdminClient();

    const token_encrypted = encryptTokenGCM(token);
    const token_fingerprint = hmacHex(token);
    const expires_at = new Date(Date.now() + Number(expiresInDays) * 86_400_000).toISOString();

    const { data, error } = await admin
        .from("workspace_invites")
        .insert({
            workspace_id: workspaceId,
            creator_user_id: creatorUserId,
            role: normalizedRole,
            token_encrypted,
            token_fingerprint,
            token_preview: previewFromToken(token),
            expires_at,
            max_uses: typeof maxUses === "number" ? Math.max(0, Math.floor(maxUses)) : null,
            key_version: 1,
        })
        .select("id")
        .maybeSingle();

    if (error) throw error;
    return { id: data?.id as string | undefined, token };
}

export async function revealTeamInviteAction(inviteId: string) {
    if (!inviteId || typeof inviteId !== "string") throw new Error("Missing inviteId");

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const admin = createAdminClient();
    const { data: invite, error: inviteError } = await admin
        .from("workspace_invites")
        .select("id, creator_user_id, workspace_id, token_encrypted, key_version")
        .eq("id", inviteId)
        .maybeSingle();

    if (inviteError) throw inviteError;
    if (!invite) throw new Error("Invite not found");

    const { data: actorMembership, error: actorMembershipError } = await admin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", invite.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();
    if (actorMembershipError) throw actorMembershipError;

    const isCreatorAndCurrentMember =
        invite.creator_user_id === user.id && Boolean(actorMembership);

    if (!isCreatorAndCurrentMember) {
        await ensureTeamOwnerOrAdmin(
            supabase,
            user.id,
            invite.workspace_id,
            "Only workspace owners or admins may reveal invites."
        );
    }

    if (!invite.token_encrypted) throw new Error("Token reveal not available; encryption not configured");

    try {
        const token = decryptTokenGCM(invite.token_encrypted);
        return { id: invite.id as string, token };
    } catch {
        throw new Error("Failed to decrypt token");
    }
}

export async function revokeTeamInviteAction(inviteId: string) {
    if (!inviteId || typeof inviteId !== "string") throw new Error("Missing inviteId");

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const admin = createAdminClient();
    const { data: invite, error: inviteError } = await admin
        .from("workspace_invites")
        .select("id, creator_user_id, workspace_id")
        .eq("id", inviteId)
        .maybeSingle();

    if (inviteError) throw inviteError;
    if (!invite) throw new Error("Invite not found");

    const { data: actorMembership, error: actorMembershipError } = await admin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", invite.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();
    if (actorMembershipError) throw actorMembershipError;

    const isCreatorAndCurrentMember =
        invite.creator_user_id === user.id && Boolean(actorMembership);

    if (!isCreatorAndCurrentMember) {
        await ensureTeamOwnerOrAdmin(
            supabase,
            user.id,
            invite.workspace_id,
            "Only workspace owners or admins may revoke invites."
        );
    }

    const { data, error } = await admin.from("workspace_invites").delete().eq("id", inviteId).select("id").maybeSingle();
    if (error) throw error;

    revalidateWorkspacePaths();
    return { success: true as const, id: data?.id };
}

export async function acceptTeamInviteAction(token: string, userId: string) {
    if (!token || token.length < 6) return { success: false as const, error: "Invite code too short" };
    if (!userId) return { success: false as const, error: "Please sign in" };

    const supa = await createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user || user.id !== userId) return { success: false as const, error: "Please sign in" };

    const admin = createAdminClient();
    const fp = hmacHex(token);

    const nowIso = new Date().toISOString();
    const { data: inv, error: invErr } = await admin
        .from("workspace_invites")
        .select("id, workspace_id, expires_at, max_uses, uses_count")
        .eq("token_fingerprint", fp)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .maybeSingle();

    if (invErr) return { success: false as const, error: "Could not create join request" };
    if (!inv) return { success: false as const, error: "Invalid or expired invite" };
    if (inv.max_uses != null && (inv.uses_count ?? 0) >= inv.max_uses)
        return { success: false as const, error: "Invalid or expired invite" };

    const { data: existingMembership } = await admin
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", inv.workspace_id)
        .eq("user_id", userId)
        .maybeSingle();
    if (existingMembership) {
        return { success: false as const, error: "You are already a member of this workspace" };
    }

    const { data: existing } = await admin
        .from("workspace_join_requests")
        .select("id")
        .eq("workspace_id", inv.workspace_id)
        .eq("requester_user_id", userId)
        .eq("status", "pending")
        .maybeSingle();

    if (existing) return { success: false as const, error: "You already have a pending request" };

    const { data: created, error: insErr } = await admin
        .from("workspace_join_requests")
        .insert({ workspace_id: inv.workspace_id, invite_id: inv.id, requester_user_id: userId, status: "pending" })
        .select("id")
        .maybeSingle();

    if (insErr) {
        console.error("Failed to create join request:", insErr);
        return { success: false as const, error: "Could not create join request", details: insErr.message };
    }
    return { success: true as const, requestId: created?.id as string };
}

// ————————————————————————— TEAM JOIN REQUESTS —————————————————————————
export async function approveJoinRequest(requestId: string) {
    if (!requestId || typeof requestId !== "string") throw new Error("Missing requestId");

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user?.id) throw new Error("Unauthorized");

    const { data, error } = await supabase.rpc("approve_workspace_join_request", {
        p_request_id: requestId,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id) throw new Error("Join request not found");

    revalidateWorkspacePaths();
    return { success: true as const, id: row.id, workspaceId: row.workspace_id };
}

export async function rejectJoinRequest(requestId: string) {
    if (!requestId || typeof requestId !== "string") throw new Error("Missing requestId");

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user?.id) throw new Error("Unauthorized");

    const { data, error } = await supabase.rpc("reject_workspace_join_request", {
        p_request_id: requestId,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id) throw new Error("Join request not found");

    revalidateWorkspacePaths();
    return { success: true as const, id: row.id, workspaceId: row.workspace_id };
}
