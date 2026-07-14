"use server"

import { revalidatePath } from 'next/cache'
import { makeKeyV2, hmacSecret } from '@/lib/keygen';
import { invalidateGatewayKeyCache } from '@/lib/gateway/invalidateKeyCache';
import { enforceTeamKeyLimit } from "@/lib/server/teamLimits";
import { resolveActiveKeyPepper } from "@/lib/server/keyPepper";
import {
    requireActingUser,
    requireAuthenticatedUser,
    requireWorkspaceMembership,
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

function nonNegativeInteger(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
}

function isMissingExpiresAtColumnError(error: unknown): boolean {
    const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
    return message.includes("expires_at") && message.includes("schema cache");
}

export async function createApiKeyAction(
    name: string,
    creatorUserId: string,
    workspaceId: string,
    scopes: string = '[]', // store JSON string if that's your current pattern
    limits?: KeyLimitPayload
) {
    if (!name) throw new Error('Missing name');
    if (!creatorUserId) throw new Error('Missing creatorUserId');
    if (!workspaceId) throw new Error('Missing workspaceId');

    const { supabase, user } = await requireAuthenticatedUser();
    requireActingUser(creatorUserId, user.id);
    await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);
    await enforceTeamKeyLimit(supabase as any, workspaceId);
    const { kid, secret, plaintext, prefix } = makeKeyV2();

    const pepper = resolveActiveKeyPepper();

    const hash = hmacSecret(secret, pepper); // HMAC(secret), not the whole token

    const insertObj = {
        workspace_id: workspaceId,
        name,
        kid,         // NEW
        hash,        // NEW (HMAC of secret)
        prefix,      // UI helper (kid[:6])
        status: 'active',
        scopes,
        created_by: creatorUserId,
        // DB constraints: request limit columns are NOT NULL.
        // Use 0 to represent "no request limit".
        daily_limit_requests: nonNegativeInteger(limits?.dailyRequests),
        weekly_limit_requests: nonNegativeInteger(limits?.weeklyRequests),
        monthly_limit_requests: nonNegativeInteger(limits?.monthlyRequests),
        // DB constraints: cost limit nanos columns are NOT NULL.
        // Use 0 to represent "no cost limit" (UI can still treat 0 as unlimited).
        daily_limit_cost_nanos: nonNegativeInteger(limits?.dailyCostNanos),
        weekly_limit_cost_nanos: nonNegativeInteger(limits?.weeklyCostNanos),
        monthly_limit_cost_nanos: nonNegativeInteger(limits?.monthlyCostNanos),
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
        .select("workspace_id, status")
        .eq("id", id)
        .maybeSingle();
    if (keyErr) throw keyErr;
    if (!keyRow?.workspace_id) throw new Error("Key not found");
    if (String(keyRow.status ?? "").toLowerCase() === "deleted") {
        throw new Error("Deleted keys cannot be edited");
    }
    await requireWorkspaceMembership(supabase, user.id, keyRow.workspace_id, ["owner", "admin"]);

    const updateObj: any = {}
    if (typeof updates.name === "string") updateObj.name = updates.name
    if (typeof updates.paused === "boolean") updateObj.status = updates.paused ? "paused" : "active"

    const { error } = await supabase
        .from("keys")
        .update(updateObj)
        .eq("id", id)
        .eq("workspace_id", keyRow.workspace_id);
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
            "id,workspace_id,name,status,scopes,daily_limit_requests,weekly_limit_requests,monthly_limit_requests,daily_limit_cost_nanos,weekly_limit_cost_nanos,monthly_limit_cost_nanos,soft_blocked"
        )
        .eq("id", id)
        .maybeSingle();
    if (oldKeyErr) throw oldKeyErr;
    if (!oldKey?.workspace_id) throw new Error("Key not found");
    if (String(oldKey.status ?? "").toLowerCase() === "deleted") {
        throw new Error("Deleted keys cannot be rotated");
    }
    await requireWorkspaceMembership(supabase, user.id, oldKey.workspace_id, ["owner", "admin"]);
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
        workspace_id: oldKey.workspace_id,
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
        let updateErr: any = null;
        const firstAttempt = await supabase
            .from("keys")
            .update(updatePayload)
            .eq("id", id)
            .eq("workspace_id", oldKey.workspace_id);
        updateErr = firstAttempt.error;
        if (
            updateErr &&
            isMissingExpiresAtColumnError(updateErr) &&
            Object.prototype.hasOwnProperty.call(updatePayload, "expires_at")
        ) {
            delete (updatePayload as any).expires_at;
            if (Object.keys(updatePayload).length > 0) {
                const retryAttempt = await supabase
                    .from("keys")
                    .update(updatePayload)
                    .eq("id", id)
                    .eq("workspace_id", oldKey.workspace_id);
                updateErr = retryAttempt.error;
            } else {
                updateErr = null;
            }
        }
        if (updateErr) {
            // Best-effort compensation: avoid leaving an extra key when old key expiry update fails.
            const { error: rollbackErr } = await supabase
                .from("keys")
                .delete()
                .eq("id", newKey.id)
                .eq("workspace_id", oldKey.workspace_id);
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
        .select("workspace_id, name, status")
        .eq("id", id)
        .maybeSingle();
    if (keyErr) throw keyErr;
    if (!keyRow?.workspace_id) throw new Error("Key not found");
    await requireWorkspaceMembership(supabase, user.id, keyRow.workspace_id, ["owner", "admin"]);

    // optionally verify name matches before deleting
    if (confirmName) {
        if (keyRow.name !== confirmName) throw new Error("Confirmation name does not match")
    }

    // If already deleted, treat as success to keep the action idempotent.
    if (String(keyRow.status ?? "").toLowerCase() === "deleted") {
        return { success: true, alreadyDeleted: true };
    }

    // Invalidate gateway key cache before revocation while the key row still exists.
    await invalidateGatewayKeyCache(id);

    const deletedAtIso = new Date().toISOString();
    const tombstoneHash = `deleted:${id}`;

    // Soft-delete the key row to preserve usage attribution history.
    let error: any = null;
    const firstDeleteAttempt = await supabase
        .from("keys")
        .update({
            status: "deleted",
            expires_at: deletedAtIso,
            soft_blocked: true,
            hash: tombstoneHash,
        })
        .eq("id", id)
        .eq("workspace_id", keyRow.workspace_id);
    error = firstDeleteAttempt.error;
    if (error && isMissingExpiresAtColumnError(error)) {
        const fallbackDeleteAttempt = await supabase
            .from("keys")
            .update({
                status: "deleted",
                soft_blocked: true,
                hash: tombstoneHash,
            })
            .eq("id", id)
            .eq("workspace_id", keyRow.workspace_id);
        error = fallbackDeleteAttempt.error;
    }
    if (error) throw error

    // Match prior hard-delete behavior for key-linked configuration.
    const { error: guardrailLinkError } = await supabase
        .from("key_guardrails")
        .delete()
        .eq("key_id", id);
    if (guardrailLinkError) throw guardrailLinkError;

    const { error: broadcastLinkError } = await supabase
        .from("broadcast_destination_keys")
        .delete()
        .eq("key_id", id);
    if (broadcastLinkError) throw broadcastLinkError;

    revalidatePath("/settings/keys")
    revalidatePath("/settings/guardrails")
    revalidatePath("/settings/broadcast")
    revalidatePath("/settings/usage")
    revalidatePath("/settings/usage/logs")
    return { success: true }
}

export async function updateKeyLimitsAction(id: string, payload: KeyLimitPayload) {
    if (!id || typeof id !== "string") throw new Error("Missing id");
    const { supabase, user } = await requireAuthenticatedUser();
    const { data: keyRow, error: keyErr } = await supabase
        .from("keys")
        .select("workspace_id, status")
        .eq("id", id)
        .maybeSingle();
    if (keyErr) throw keyErr;
    if (!keyRow?.workspace_id) throw new Error("Key not found");
    if (String(keyRow.status ?? "").toLowerCase() === "deleted") {
        throw new Error("Deleted keys cannot be modified");
    }
    await requireWorkspaceMembership(supabase, user.id, keyRow.workspace_id, ["owner", "admin"]);

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
        .eq("workspace_id", keyRow.workspace_id);
    if (error) throw error;

    await invalidateGatewayKeyCache(id);

    revalidatePath("/settings/keys");
    return { success: true };
}
