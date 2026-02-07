// app/(dashboard)/settings/byok/actions.ts
"use server";

import { Buffer } from "node:buffer";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { encryptSecret, sha256Hex } from "@/lib/byok/crypto";
import { cookies } from "next/headers";
import { getTeamIdFromCookie } from "@/utils/teamCookie";

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

    const supabase = await createClient();

    // Derive metadata & ciphertext
    const enc = encryptSecret(value);

    // Get team_id from session/user (example)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const cookieStore = await cookies();
    const activeTeamId = cookieStore.get('activeTeamId')?.value;
    if (!activeTeamId) throw new Error("No active team selected");

    const insertObj = {
        team_id: activeTeamId,
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
        created_by: user.id,
    };

    const { data, error } = await supabase
        .from("byok_keys")
        .insert(insertObj)
        .select("id")
        .maybeSingle();

    if (error) {
        // Normalize duplicate key / unique constraint errors into a friendly message
        const msg = (error.message || "").toString().toLowerCase();
        if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("fingerprint")) {
            throw new Error("Duplicate key");
        }
        throw error;
    }

    revalidatePath("/settings/byok");
    return { id: data?.id };
}

export async function updateByokKeyAction(
    id: string,
    updates: { name?: string; value?: string; enabled?: boolean; always_use?: boolean }
) {
    if (!id) throw new Error("Missing id");
    const supabase = await createClient();

    const patch: any = {};
    if (typeof updates.name === "string") patch.name = updates.name;
    if (typeof updates.enabled === "boolean") patch.enabled = updates.enabled;
    if (typeof updates.always_use === "boolean") patch.always_use = updates.always_use;

    if (typeof updates.value === "string") {
        const enc = encryptSecret(updates.value);
        // bytea columns expect hex-prefixed strings (`\x...`)
        patch.enc_value = base64ToPgBytea(enc.ciphertextB64);
        patch.enc_iv = base64ToPgBytea(enc.ivB64);
        patch.enc_tag = base64ToPgBytea(enc.tagB64);
        patch.key_version = enc.keyVersion;
        patch.fingerprint_sha256 = enc.fingerprintHex;
        patch.prefix = enc.prefix;
        patch.suffix = enc.suffix;
        patch.verification_status = "unknown";
        patch.error_message = null;
    }

    const { error } = await supabase.from("byok_keys").update(patch).eq("id", id);
    if (error) throw error;

    revalidatePath("/settings/byok");
    return { success: true };
}

export async function deleteByokKeyAction(id: string) {
    if (!id) throw new Error("Missing id");
    const supabase = await createClient();
    const { error } = await supabase.from("byok_keys").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/settings/byok");
    return { success: true };
}

export async function updateByokFallbackAction(enabled: boolean) {
    const supabase = await createClient();
    const teamId = await getTeamIdFromCookie();
    if (!teamId) {
        throw new Error("Missing team id");
    }
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
        throw new Error("Unauthorized");
    }

    const { data: membership, error: membershipError } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (membershipError) {
        throw membershipError;
    }
    if (!membership) {
        throw new Error("Unauthorized");
    }

    const payload = {
        team_id: teamId,
        byok_fallback_enabled: enabled,
        updated_at: new Date().toISOString(),
    };

    const { data: existing, error: fetchError } = await supabase
        .from("team_settings")
        .select("team_id")
        .eq("team_id", teamId)
        .maybeSingle();

    if (fetchError) {
        throw fetchError;
    }

    const { error } = existing
        ? await supabase
              .from("team_settings")
              .update(payload)
              .eq("team_id", teamId)
        : await supabase.from("team_settings").insert({
              ...payload,
              routing_mode: "balanced",
          });

    if (error) {
        throw error;
    }

    revalidatePath("/settings/byok");
}
