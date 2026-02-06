"use server";

import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { revalidatePath } from "next/cache";

export type RoutingMode = "balanced" | "price" | "latency" | "throughput";

async function requireTeamAccess() {
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

    return { supabase, teamId };
}

async function upsertTeamSettings(
    supabase: Awaited<ReturnType<typeof createClient>>,
    teamId: string,
    payload: Record<string, any>
) {
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
        : await supabase.from("team_settings").insert(payload);

    if (error) {
        throw error;
    }
}

export async function updateRoutingMode(mode: RoutingMode) {
    const { supabase, teamId } = await requireTeamAccess();

    const payload = {
        team_id: teamId,
        routing_mode: mode,
        updated_at: new Date().toISOString(),
    };

    await upsertTeamSettings(supabase, teamId, payload);
    revalidatePath("/settings/routing");
}

export async function updateBetaChannelEnabled(enabled: boolean) {
    const { supabase, teamId } = await requireTeamAccess();

    const payload = {
        team_id: teamId,
        beta_channel_enabled: enabled,
        updated_at: new Date().toISOString(),
    };

    await upsertTeamSettings(supabase, teamId, payload);
    revalidatePath("/settings/routing");
}
