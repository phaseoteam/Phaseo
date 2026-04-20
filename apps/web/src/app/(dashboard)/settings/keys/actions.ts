"use server"

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { makeKeyV2, hmacSecret } from '@/lib/keygen';
import { invalidateGatewayKeyCache } from '@/lib/gateway/invalidateKeyCache';
import { enforceTeamKeyLimit } from "@/lib/server/teamLimits";
import { resolveActiveKeyPepper } from "@/lib/server/keyPepper";
import {
    requireActingUser,
    requireAuthenticatedUser,
    requireTeamMembership,
} from '@/utils/serverActionAuth';

export type KeyLimitPayload = {
    dailyRequests?: number | null;
    weeklyRequests?: number | null;
    monthlyRequests?: number | null;
    dailyCostNanos?: number | null;
    weeklyCostNanos?: number | null;
    monthlyCostNanos?: number | null;
    softBlocked?: boolean;
};

export type RotateApiKeyInput = {
    id: string;
    newName?: string;
    previousKeyExpiresAt?: string | null;
};

export async function createApiKeyAction(
    name: string,
    creatorUserId: string,
    teamId: string,
    scopes: string = '[]' // store JSON string if that's your current pattern
) {
    if (!name) throw new Error('Missing name');
    if (!creatorUserId) throw new Error('Missing creatorUserId');
    if (!teamId) throw new Error('Missing teamId');

    const { supabase, user } = await requireAuthenticatedUser();
    requireActingUser(creatorUserId, user.id);
    await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);
    await enforceTeamKeyLimit(supabase as any, teamId);
    const { kid, secret, plaintext, prefix } = makeKeyV2();

    const pepper = resolveActiveKeyPepper();

    const hash = hmacSecret(secret, pepper); // HMAC(secret), not the whole token

    const insertObj = {
        team_id: teamId,
        name,
        kid,         // NEW
        hash,        // NEW (HMAC of secret)
        prefix,      // UI helper (kid[:6])
        status: 'active',
        scopes,
        created_by: creatorUserId,
        // DB constraints: request limit columns are NOT NULL.
        // Use 0 to represent "no request limit".
        daily_limit_requests: 0,
        weekly_limit_requests: 0,
        monthly_limit_requests: 0,
        // DB constraints: cost limit nanos columns are NOT NULL.
        // Use 0 to represent "no cost limit" (UI can still treat 0 as unlimited).
        daily_limit_cost_nanos: 0,
        weekly_limit_cost_nanos: 0,
        monthly_limit_cost_nanos: 0,
    };

    const { data, error } = await supabase
        .from('keys')
        .insert(insertObj)
        .select('id')
        .maybeSingle();

    if (error) throw error;

    revalidatePath('/settings/keys');

    // Show plaintext once; never store it
    return { id: data?.id as string | undefined, plaintext, prefix };
}

export async function updateApiKeyAction(
    id: string,
    updates: { name?: string; paused?: boolean }
) {
    if (!id || typeof id !== "string") throw new Error("Missing id")
    const { supabase, user } = await requireAuthenticatedUser();
    const { data: keyRow, error: keyErr } = await supabase
        .from("keys")
        .select("team_id")
        .eq("id", id)
        .maybeSingle();
    if (keyErr) throw keyErr;
    if (!keyRow?.team_id) throw new Error("Key not found");
    await requireTeamMembership(supabase, user.id, keyRow.team_id, ["owner", "admin"]);

    const updateObj: any = {}
    if (typeof updates.name === "string") updateObj.name = updates.name
    if (typeof updates.paused === "boolean") updateObj.status = updates.paused ? "paused" : "active"

    const { error } = await supabase
        .from("keys")
        .update(updateObj)
        .eq("id", id)
        .eq("team_id", keyRow.team_id);
    if (error) throw error

    if (Object.prototype.hasOwnProperty.call(updateObj, "status")) {
        await invalidateGatewayKeyCache(id);
    }

    revalidatePath("/settings/keys")
    return { success: true }
}

export async function rotateApiKeyAction(input: RotateApiKeyInput) {
    const id = input?.id;
    if (!id || typeof id !== "string") throw new Error("Missing id");

    const { supabase, user } = await requireAuthenticatedUser();
    const { data: oldKey, error: oldKeyErr } = await supabase
        .from("keys")
        .select(
            "id,team_id,name,scopes,daily_limit_requests,weekly_limit_requests,monthly_limit_requests,daily_limit_cost_nanos,weekly_limit_cost_nanos,monthly_limit_cost_nanos,soft_blocked"
        )
        .eq("id", id)
        .maybeSingle();
    if (oldKeyErr) throw oldKeyErr;
    if (!oldKey?.team_id) throw new Error("Key not found");
    await requireTeamMembership(supabase, user.id, oldKey.team_id, ["owner", "admin"]);
    // Rotation is an in-place replacement flow, so skip the hard team key cap check.
    // The previous key can remain temporarily for overlap based on expires_at.

    const previousKeyExpiresAtRaw = input.previousKeyExpiresAt;
    let previousKeyExpiresAt: string | null = null;
    if (previousKeyExpiresAtRaw !== undefined) {
        if (previousKeyExpiresAtRaw === null || String(previousKeyExpiresAtRaw).trim() === "") {
            previousKeyExpiresAt = null;
        } else {
            const parsed = new Date(previousKeyExpiresAtRaw);
            if (Number.isNaN(parsed.getTime())) {
                throw new Error("Invalid expiry time");
            }
            previousKeyExpiresAt = parsed.toISOString();
        }
    }

    const { kid, secret, plaintext, prefix } = makeKeyV2();
    const pepper = resolveActiveKeyPepper();
    const hash = hmacSecret(secret, pepper);
    const newName = typeof input.newName === "string" && input.newName.trim().length > 0
        ? input.newName.trim()
        : `${oldKey.name} (rotated)`;

    const insertObj = {
        team_id: oldKey.team_id,
        name: newName,
        kid,
        hash,
        prefix,
        status: "active",
        scopes: oldKey.scopes ?? "[]",
        created_by: user.id,
        daily_limit_requests: Number(oldKey.daily_limit_requests ?? 0) || 0,
        weekly_limit_requests: Number(oldKey.weekly_limit_requests ?? 0) || 0,
        monthly_limit_requests: Number(oldKey.monthly_limit_requests ?? 0) || 0,
        daily_limit_cost_nanos: Number(oldKey.daily_limit_cost_nanos ?? 0) || 0,
        weekly_limit_cost_nanos: Number(oldKey.weekly_limit_cost_nanos ?? 0) || 0,
        monthly_limit_cost_nanos: Number(oldKey.monthly_limit_cost_nanos ?? 0) || 0,
        soft_blocked: Boolean(oldKey.soft_blocked),
    };

    const { data: newKey, error: insertErr } = await supabase
        .from("keys")
        .insert(insertObj)
        .select("id")
        .maybeSingle();
    if (insertErr) throw insertErr;
    if (!newKey?.id) throw new Error("Failed to create rotated key");

    const updatePayload: Record<string, unknown> = {};
    if (previousKeyExpiresAtRaw !== undefined) {
        updatePayload.expires_at = previousKeyExpiresAt;
    }

    if (Object.keys(updatePayload).length > 0) {
        const { error: updateErr } = await supabase
            .from("keys")
            .update(updatePayload)
            .eq("id", id)
            .eq("team_id", oldKey.team_id);
        if (updateErr) {
            // Best-effort compensation: avoid leaving an extra key when old key expiry update fails.
            const { error: rollbackErr } = await supabase
                .from("keys")
                .delete()
                .eq("id", newKey.id)
                .eq("team_id", oldKey.team_id);
            if (rollbackErr) {
                throw new Error(
                    `Key rotation failed and rollback also failed: ${updateErr.message}; rollback: ${rollbackErr.message}`
                );
            }
            throw updateErr;
        }
        await invalidateGatewayKeyCache(id);
    }

    revalidatePath("/settings/keys");
    return {
        id: newKey?.id as string | undefined,
        plaintext,
        prefix,
        previousKeyExpiresAt,
    };
}

export async function deleteApiKeyAction(id: string, confirmName?: string) {
    if (!id || typeof id !== "string") throw new Error("Missing id")
    const { supabase, user } = await requireAuthenticatedUser();
    const { data: keyRow, error: keyErr } = await supabase
        .from("keys")
        .select("team_id, name")
        .eq("id", id)
        .maybeSingle();
    if (keyErr) throw keyErr;
    if (!keyRow?.team_id) throw new Error("Key not found");
    await requireTeamMembership(supabase, user.id, keyRow.team_id, ["owner", "admin"]);

    // optionally verify name matches before deleting
    if (confirmName) {
        if (keyRow.name !== confirmName) throw new Error("Confirmation name does not match")
    }

    // Invalidate gateway key cache before deletion while the key row still exists.
    await invalidateGatewayKeyCache(id);

    const { error } = await supabase
        .from("keys")
        .delete()
        .eq("id", id)
        .eq("team_id", keyRow.team_id)
    if (error) throw error

    revalidatePath("/settings/keys")
    return { success: true }
}

export async function updateKeyLimitsAction(id: string, payload: KeyLimitPayload) {
    if (!id || typeof id !== "string") throw new Error("Missing id");
    const { supabase, user } = await requireAuthenticatedUser();
    const { data: keyRow, error: keyErr } = await supabase
        .from("keys")
        .select("team_id")
        .eq("id", id)
        .maybeSingle();
    if (keyErr) throw keyErr;
    if (!keyRow?.team_id) throw new Error("Key not found");
    await requireTeamMembership(supabase, user.id, keyRow.team_id, ["owner", "admin"]);

    const updateObj = {
        // DB constraints: request limit columns are NOT NULL.
        // Use 0 to represent "no request limit".
        daily_limit_requests: payload.dailyRequests ?? 0,
        weekly_limit_requests: payload.weeklyRequests ?? 0,
        monthly_limit_requests: payload.monthlyRequests ?? 0,
        // DB constraints: cost limit nanos columns are NOT NULL.
        // Use 0 to represent "no cost limit" (UI can still treat 0 as unlimited).
        daily_limit_cost_nanos: payload.dailyCostNanos ?? 0,
        weekly_limit_cost_nanos: payload.weeklyCostNanos ?? 0,
        monthly_limit_cost_nanos: payload.monthlyCostNanos ?? 0,
        soft_blocked: typeof payload.softBlocked === "boolean" ? payload.softBlocked : undefined,
    };

    if (updateObj.soft_blocked === undefined) {
        delete (updateObj as any).soft_blocked;
    }

    const { error } = await supabase
        .from("keys")
        .update(updateObj)
        .eq("id", id)
        .eq("team_id", keyRow.team_id);
    if (error) throw error;

    await invalidateGatewayKeyCache(id);

    revalidatePath("/settings/keys");
    return { success: true };
}
