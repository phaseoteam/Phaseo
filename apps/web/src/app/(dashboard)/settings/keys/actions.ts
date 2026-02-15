"use server"

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { makeKeyV2, hmacSecret } from '@/lib/keygen';
import { invalidateGatewayKeyCache } from '@/lib/gateway/invalidateKeyCache';
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
    const { kid, secret, plaintext, prefix } = makeKeyV2();

    const pepper = process.env.KEY_PEPPER!;
    if (!pepper) throw new Error("KEY_PEPPER not set");

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

    const { error } = await supabase
        .from("keys")
        .delete()
        .eq("id", id)
        .eq("team_id", keyRow.team_id)
    if (error) throw error

    await invalidateGatewayKeyCache(id);

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

    revalidatePath("/settings/keys");
    return { success: true };
}
