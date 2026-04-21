// app/(dashboard)/settings/byok/actions.ts
"use server";

import { Buffer } from "node:buffer";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { encryptSecret } from "@/lib/byok/crypto";
import { validateProviderKeyFormat } from "@/lib/byok/providerKeyValidation";
import { cookies } from "next/headers";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import {
    requireAuthenticatedUser,
    requireWorkspaceMembership,
} from "@/utils/serverActionAuth";

function base64ToPgBytea(b64: string): string {
    if (!b64) throw new Error("Missing base64 value");
    const buf = Buffer.from(b64, "base64");
    return `\\x${buf.toString("hex")}`;
}

export async function createByokKeyAction(
    name: string,
    providerId: string,
    value: string,
    enabled = true,
    always_use = false
) {
    if (!name) throw new Error("Missing name");
    if (!providerId) throw new Error("Missing providerId");
    if (!value) throw new Error("Missing key value");
    const formatCheck = validateProviderKeyFormat(providerId, value);
    if (!formatCheck.ok) {
        throw new Error(formatCheck.message);
    }

    const { supabase, user } = await requireAuthenticatedUser();

    // Derive metadata & ciphertext
    const enc = encryptSecret(value);

    // Get workspace_id from session/user (example)
    const cookieStore = await cookies();
    const activeWorkspaceId = cookieStore.get('activeWorkspaceId')?.value;
    if (!activeWorkspaceId) throw new Error("No active workspace selected");
    await requireWorkspaceMembership(supabase, user.id, activeWorkspaceId, ["owner", "admin"]);

    const basePayload = {
        workspace_id: activeWorkspaceId,
        provider_id: providerId,
        name,
        enabled,
        always_use,
        // bytea columns expect hex-prefixed strings (`\x...`) so convert Base64 blobs
        enc_value: base64ToPgBytea(enc.ciphertextB64),
        enc_iv: base64ToPgBytea(enc.ivB64),
        enc_tag: base64ToPgBytea(enc.tagB64),
        key_version: enc.keyVersion,
        fingerprint_sha256: enc.fingerprintHex,
        prefix: enc.prefix,
        suffix: enc.suffix,
        verification_status: formatCheck.strict ? "format_valid_strict" : "format_valid",
        error_message: null,
        last_verified_at: new Date().toISOString(),
        created_by: user.id,
    };

    const { data: existingRows, error: existingError } = await supabase
        .from("byok_keys")
        .select("id, created_at")
        .eq("workspace_id", activeWorkspaceId)
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false });
    if (existingError) throw existingError;

    const existing = (existingRows ?? []) as Array<{ id: string; created_at: string }>;
    if (existing.length > 0) {
        const primary = existing[0];
        const duplicateIds = existing.slice(1).map((row) => row.id);
        if (duplicateIds.length > 0) {
            const { error: cleanupError } = await supabase
                .from("byok_keys")
                .delete()
                .in("id", duplicateIds)
                .eq("workspace_id", activeWorkspaceId);
            if (cleanupError) throw cleanupError;
        }

        const { error: updateError } = await supabase
            .from("byok_keys")
            .update({
                workspace_id: activeWorkspaceId,
                provider_id: providerId,
                name,
                enabled,
                always_use,
                enc_value: basePayload.enc_value,
                enc_iv: basePayload.enc_iv,
                enc_tag: basePayload.enc_tag,
                key_version: basePayload.key_version,
                fingerprint_sha256: basePayload.fingerprint_sha256,
                prefix: basePayload.prefix,
                suffix: basePayload.suffix,
            })
            .eq("id", primary.id)
            .eq("workspace_id", activeWorkspaceId);
        if (updateError) throw updateError;

        revalidatePath("/settings/byok");
        return { id: primary.id, mode: "updated" as const };
    }

    const { data, error } = await supabase
        .from("byok_keys")
        .insert(basePayload)
        .select("id")
        .maybeSingle();
    if (error) {
        const msg = String(error.message ?? "").toLowerCase();
        const isTeamProviderConflict =
            msg.includes("duplicate") || msg.includes("unique") || msg.includes("byok_keys_team_provider_unique");
        if (!isTeamProviderConflict) throw error;

        const { data: row, error: fetchConflictError } = await supabase
            .from("byok_keys")
            .select("id")
            .eq("workspace_id", activeWorkspaceId)
            .eq("provider_id", providerId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (fetchConflictError || !row?.id) {
            throw fetchConflictError ?? error;
        }

        const { error: conflictUpdateError } = await supabase
            .from("byok_keys")
            .update({
                workspace_id: activeWorkspaceId,
                provider_id: providerId,
                name,
                enabled,
                always_use,
                enc_value: basePayload.enc_value,
                enc_iv: basePayload.enc_iv,
                enc_tag: basePayload.enc_tag,
                key_version: basePayload.key_version,
                fingerprint_sha256: basePayload.fingerprint_sha256,
                prefix: basePayload.prefix,
                suffix: basePayload.suffix,
            })
            .eq("id", row.id)
            .eq("workspace_id", activeWorkspaceId);
        if (conflictUpdateError) throw conflictUpdateError;

        revalidatePath("/settings/byok");
        return { id: row.id, mode: "updated" as const };
    }

    revalidatePath("/settings/byok");
    return { id: data?.id, mode: "created" as const };
}

export async function updateByokKeyAction(
    id: string,
    updates: { name?: string; value?: string; enabled?: boolean; always_use?: boolean }
) {
    if (!id) throw new Error("Missing id");
    const { supabase, user } = await requireAuthenticatedUser();
    const { data: row, error: rowError } = await supabase
        .from("byok_keys")
        .select("workspace_id,provider_id")
        .eq("id", id)
        .maybeSingle();
    if (rowError) throw rowError;
    if (!row?.workspace_id) throw new Error("BYOK key not found");
    await requireWorkspaceMembership(supabase, user.id, row.workspace_id, ["owner", "admin"]);

    const patch: any = {};
    if (typeof updates.name === "string") patch.name = updates.name;
    if (typeof updates.enabled === "boolean") patch.enabled = updates.enabled;
    if (typeof updates.always_use === "boolean") patch.always_use = updates.always_use;

    if (typeof updates.value === "string") {
        const nextValue = updates.value.trim();
        if (!nextValue) {
            throw new Error("Key value cannot be empty");
        }
        const formatCheck = validateProviderKeyFormat(row.provider_id, nextValue);
        if (!formatCheck.ok) {
            throw new Error(formatCheck.message);
        }

        const enc = encryptSecret(nextValue);
        // bytea columns expect hex-prefixed strings (`\x...`)
        patch.enc_value = base64ToPgBytea(enc.ciphertextB64);
        patch.enc_iv = base64ToPgBytea(enc.ivB64);
        patch.enc_tag = base64ToPgBytea(enc.tagB64);
        patch.key_version = enc.keyVersion;
        patch.fingerprint_sha256 = enc.fingerprintHex;
        patch.prefix = enc.prefix;
        patch.suffix = enc.suffix;
        patch.verification_status = formatCheck.strict ? "format_valid_strict" : "format_valid";
        patch.error_message = null;
        patch.last_verified_at = new Date().toISOString();
    }

    const { error } = await supabase
        .from("byok_keys")
        .update(patch)
        .eq("id", id)
        .eq("workspace_id", row.workspace_id);
    if (error) throw error;

    revalidatePath("/settings/byok");
    return { success: true };
}

export async function deleteByokKeyAction(id: string) {
    if (!id) throw new Error("Missing id");
    const { supabase, user } = await requireAuthenticatedUser();
    const { data: row, error: rowError } = await supabase
        .from("byok_keys")
        .select("workspace_id")
        .eq("id", id)
        .maybeSingle();
    if (rowError) throw rowError;
    if (!row?.workspace_id) throw new Error("BYOK key not found");
    await requireWorkspaceMembership(supabase, user.id, row.workspace_id, ["owner", "admin"]);
    const { error } = await supabase
        .from("byok_keys")
        .delete()
        .eq("id", id)
        .eq("workspace_id", row.workspace_id);
    if (error) throw error;
    revalidatePath("/settings/byok");
    return { success: true };
}

export async function updateByokFallbackAction(enabled: boolean) {
    const { supabase, user } = await requireAuthenticatedUser();
    const workspaceId = await getWorkspaceIdFromCookie();
    if (!workspaceId) {
        throw new Error("Missing workspace id");
    }
    await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

    const payload = {
        workspace_id: workspaceId,
        byok_fallback_enabled: enabled,
        updated_at: new Date().toISOString(),
    };

    const { data: existing, error: fetchError } = await supabase
        .from("workspace_settings")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

    if (fetchError) {
        throw fetchError;
    }

    const { error } = existing
        ? await supabase
              .from("workspace_settings")
              .update(payload)
              .eq("workspace_id", workspaceId)
        : await supabase.from("workspace_settings").insert({
              ...payload,
              routing_mode: "balanced",
          });

    if (error) {
        throw error;
    }

    revalidatePath("/settings/byok");
}
