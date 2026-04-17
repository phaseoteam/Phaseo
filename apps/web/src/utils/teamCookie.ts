"use server";

import { cookies } from "next/headers";
import { createClient } from "./supabase/server";

export async function getTeamIdFromCookie(): Promise<string | undefined> {
    try {
        const cookieStore = await cookies();
        const cookieTeamId = String(cookieStore.get("activeTeamId")?.value ?? "").trim();
        const supabase = await createClient();
        const {
            data: { user: authUser },
            error: authError,
        } = await supabase.auth.getUser();
        const userId = authUser?.id ?? null;

        const isMember = async (teamId: string): Promise<boolean> => {
            if (!userId || !teamId) return false;
            const { data, error } = await supabase
                .from("team_members")
                .select("team_id")
                .eq("user_id", userId)
                .eq("team_id", teamId)
                .limit(1)
                .maybeSingle();
            return !error && Boolean(data?.team_id);
        };

        // Prefer the explicit cookie team when it's still valid membership.
        if (cookieTeamId && (await isMember(cookieTeamId))) {
            return cookieTeamId;
        }

        // If auth is unavailable here, preserve legacy behavior.
        if (authError || !userId) {
            return cookieTeamId || undefined;
        }

        // Next preference: user's default team, but only when membership still exists.
        const { data: userRow } = await supabase
            .from("users")
            .select("default_team_id")
            .eq("user_id", userId)
            .maybeSingle();
        const defaultTeamId = String(userRow?.default_team_id ?? "").trim();
        if (defaultTeamId && (await isMember(defaultTeamId))) {
            return defaultTeamId;
        }

        // Final fallback: first team membership row for the user.
        const { data: membershipRow, error: membershipError } = await supabase
            .from("team_members")
            .select("team_id")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();

        if (!membershipError && membershipRow?.team_id) {
            const fallbackTeamId = String(membershipRow.team_id);
            // Best-effort self-heal so future reads don't keep selecting a stale default team.
            await supabase
                .from("users")
                .update({ default_team_id: fallbackTeamId })
                .eq("user_id", userId);
            return fallbackTeamId;
        }

        return undefined;
    } catch (e) {
        return undefined;
    }
}
