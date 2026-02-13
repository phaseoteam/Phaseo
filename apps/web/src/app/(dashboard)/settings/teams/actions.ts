"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { getStripe } from "@/lib/stripe";
import upsertLinearCustomer from "@/lib/linear";
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
    teamId: string,
    message: string,
) {
    const { data: userRow, error } = await supabase
        .from("users")
        .select("default_team_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) throw error;
    if (userRow?.default_team_id === teamId) {
        throw new Error(message);
    }
}

async function ensureTeamOwnerOrAdmin(
    supabase: SupabaseClient,
    userId: string,
    teamId: string,
    message = "Unauthorized",
) {
    const { data: membership, error } = await supabase
        .from("team_members")
        .select("role")
        .eq("team_id", teamId)
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

export async function createTeamAction(name: string, userId: string) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.id) throw new Error("Unauthorized");
    if (user.id !== userId) throw new Error("Unauthorized");
    const baseSlug = makeSlug(name);

    const { data, error } = await supabase
        .from("teams")
        .insert({ name, slug: baseSlug, owner_user_id: userId })
        .select("id")
        .single();

    if (error) throw error;
    const newTeamId = data?.id as string;

    await supabase
        .from("team_members")
        .upsert({ team_id: newTeamId, user_id: userId, role: "owner" }, { onConflict: "team_id,user_id", ignoreDuplicates: true });

    const stripe = getStripe();

    try {
        const userEmail = user.email || undefined;
        const customer = await stripe.customers.create({ name, email: userEmail, metadata: { team_id: newTeamId, user_id: userId } });
        if (customer && newTeamId) {
            await supabase.from("wallets").upsert(
                { team_id: newTeamId, stripe_customer_id: customer.id },
                { onConflict: "team_id", ignoreDuplicates: true },
            );
        }
    } catch (err) {
        console.error("[ERROR] creating Stripe customer:", err);
    }

    // Upsert a Linear Customer for this team. Non-blocking: failures shouldn't block team creation.
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

    revalidatePath("/settings/teams");
    return { id: newTeamId };
}

export async function updateTeamAction(teamId: string, name: string) {
    if (!teamId || typeof teamId !== "string") throw new Error("Missing teamId");
    if (!name || typeof name !== "string") throw new Error("Missing name");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("Unauthorized");
    await ensureNotPersonalTeam(
        supabase,
        user.id,
        teamId,
        "Personal team cannot be renamed."
    );
    const { data, error } = await supabase.from("teams").update({ name }).eq("id", teamId).select("id").single();
    if (error) throw error;

    revalidatePath("/settings/teams");
    return { id: data?.id as string };
}

export async function deleteTeamAction(teamId: string) {
    if (!teamId || typeof teamId !== "string") throw new Error("Missing teamId");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("Unauthorized");

    await ensureNotPersonalTeam(
        supabase,
        user.id,
        teamId,
        "Personal team cannot be deleted."
    );

    const { data: team } = await supabase.from("teams").select("id, owner_user_id").eq("id", teamId).maybeSingle();
    if (!team) throw new Error("Team not found");
    if (team.owner_user_id !== user.id) throw new Error("Only owner may delete team");

    const admin = createAdminClient();
    await admin.from("team_members").delete().eq("team_id", teamId);
    await admin.from("team_invites").delete().eq("team_id", teamId);
    await admin.from("team_join_requests").delete().eq("team_id", teamId);
    await admin.from("teams").delete().eq("id", teamId);

    revalidatePath("/settings/teams");
    return { success: true } as const;
}

export async function createTeamInviteAction(
    teamId: string,
    creatorUserId: string,
    role: string,
    token: string,
    expiresInDays = 7,
    maxUses?: number | null,
) {
    if (!teamId) throw new Error("Missing teamId");
    if (!creatorUserId) throw new Error("Missing creatorUserId");
    if (!token || token.length < 6) throw new Error("Invalid token");

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.id) throw new Error("Unauthorized");
    if (creatorUserId !== user.id) throw new Error("Unauthorized");
    await ensureTeamOwnerOrAdmin(
        supabase,
        user.id,
        teamId,
        "Only owners or admins may create team invites."
    );

    const admin = createAdminClient();

    const token_encrypted = encryptTokenGCM(token);
    const token_fingerprint = hmacHex(token);
    const expires_at = new Date(Date.now() + Number(expiresInDays) * 86_400_000).toISOString();

    const { data, error } = await admin
        .from("team_invites")
        .insert({
            team_id: teamId,
            creator_user_id: creatorUserId,
            role: role || "member",
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
        .from("team_invites")
        .select("id, creator_user_id, team_id, token_encrypted, key_version")
        .eq("id", inviteId)
        .maybeSingle();

    if (inviteError) throw inviteError;
    if (!invite) throw new Error("Invite not found");

    if (invite.creator_user_id !== user.id) {
        const { data: team, error: teamErr } = await admin.from("teams").select("owner_user_id").eq("id", invite.team_id).maybeSingle();
        if (teamErr) throw teamErr;
        if (!team) throw new Error("Team not found");
        if (team.owner_user_id !== user.id) throw new Error("Unauthorized");
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
        .from("team_invites")
        .select("id, creator_user_id, team_id")
        .eq("id", inviteId)
        .maybeSingle();

    if (inviteError) throw inviteError;
    if (!invite) throw new Error("Invite not found");

    if (invite.creator_user_id !== user.id) {
        const { data: team, error: teamErr } = await admin.from("teams").select("owner_user_id").eq("id", invite.team_id).maybeSingle();
        if (teamErr) throw teamErr;
        if (!team) throw new Error("Team not found");
        if (team.owner_user_id !== user.id) throw new Error("Unauthorized");
    }

    const { data, error } = await admin.from("team_invites").delete().eq("id", inviteId).select("id").maybeSingle();
    if (error) throw error;

    revalidatePath("/settings/teams");
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
        .from("team_invites")
        .select("id, team_id, expires_at, max_uses, uses_count")
        .eq("token_fingerprint", fp)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .maybeSingle();

    if (invErr) return { success: false as const, error: "Could not create join request" };
    if (!inv) return { success: false as const, error: "Invalid or expired invite" };
    if (inv.max_uses != null && (inv.uses_count ?? 0) >= inv.max_uses)
        return { success: false as const, error: "Invalid or expired invite" };

    const { data: existing } = await admin
        .from("team_join_requests")
        .select("id")
        .eq("team_id", inv.team_id)
        .eq("requester_user_id", userId)
        .eq("status", "pending")
        .maybeSingle();

    if (existing) return { success: false as const, error: "You already have a pending request" };

    const { data: created, error: insErr } = await admin
        .from("team_join_requests")
        .insert({ team_id: inv.team_id, invite_id: inv.id, requester_user_id: userId, status: "pending" })
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

    const admin = createAdminClient();

    const decided_at = new Date().toISOString();

    // fetch the join request first to get team, requester and invite
    const { data: req, error: reqErr } = await admin
        .from("team_join_requests")
        .select("id, team_id, requester_user_id, invite_id, status")
        .eq("id", requestId)
        .maybeSingle();
    if (reqErr) throw reqErr;
    if (!req) throw new Error("Join request not found");
    if (!req.team_id) throw new Error("Join request missing team reference");
    await ensureTeamOwnerOrAdmin(
        supabase,
        user.id,
        req.team_id,
        "Only owners or admins may approve join requests."
    );
    if (req.status !== "pending") throw new Error("Request already decided");

    const { data, error } = await admin
        .from("team_join_requests")
        .update({ status: "approved", decided_by: user.id, decided_at })
        .eq("id", requestId)
        .select("id, team_id, requester_user_id, invite_id")
        .maybeSingle();

    if (error) throw error;

    // ensure the requester is added to team_members
    const teamId = data?.team_id as string | undefined;
    const requesterId = data?.requester_user_id as string | undefined;
    const inviteId = data?.invite_id as string | null | undefined;

    if (teamId && requesterId) {
        // determine role (default to 'member') and increment invite uses_count if applicable
        let role: string = "member";
        if (inviteId) {
            const { data: invite, error: inviteErr } = await admin
                .from("team_invites")
                .select("id, role, uses_count")
                .eq("id", inviteId)
                .maybeSingle();
            if (inviteErr) throw inviteErr;
            if (invite) {
                role = invite.role || "member";
                const newUses = (invite.uses_count ?? 0) + 1;
                const { error: updErr } = await admin.from("team_invites").update({ uses_count: newUses }).eq("id", inviteId);
                if (updErr) throw updErr;
            }
        }

        // upsert membership (ignore duplicate)
        const { error: memErr } = await admin
            .from("team_members")
            .upsert({ team_id: teamId, user_id: requesterId, role }, { onConflict: "team_id,user_id", ignoreDuplicates: true });
        if (memErr) throw memErr;
    }

    revalidatePath("/settings/teams");
    return { success: true as const, id: data?.id, teamId: data?.team_id };
}

export async function rejectJoinRequest(requestId: string) {
    if (!requestId || typeof requestId !== "string") throw new Error("Missing requestId");

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user?.id) throw new Error("Unauthorized");

    const admin = createAdminClient();

    const decided_at = new Date().toISOString();

    const { data: req, error: reqErr } = await admin
        .from("team_join_requests")
        .select("team_id")
        .eq("id", requestId)
        .maybeSingle();
    if (reqErr) throw reqErr;
    if (!req) throw new Error("Join request not found");
    if (!req.team_id) throw new Error("Join request missing team reference");
    await ensureTeamOwnerOrAdmin(
        supabase,
        user.id,
        req.team_id,
        "Only owners or admins may reject join requests."
    );

    const { data, error } = await admin
        .from("team_join_requests")
        .update({ status: "denied", decided_by: user.id, decided_at })
        .eq("id", requestId)
        .select("id, team_id")
        .maybeSingle();

    if (error) throw error;

    revalidatePath("/settings/teams");
    return { success: true as const, id: data?.id, teamId: data?.team_id };
}
