"use server";

import { cookies } from "next/headers";
import { createClient } from "./supabase/server";

export async function getWorkspaceIdFromCookie(): Promise<string | undefined> {
    try {
        const cookieStore = await cookies();
        const cookieWorkspaceId = String(cookieStore.get("activeWorkspaceId")?.value ?? "").trim();
        const supabase = await createClient();
        const {
            data: { user: authUser },
            error: authError,
        } = await supabase.auth.getUser();
        const userId = authUser?.id ?? null;

        const isMember = async (workspaceId: string): Promise<boolean> => {
            if (!userId || !workspaceId) return false;
            const { data, error } = await supabase
                .from("workspace_members")
                .select("workspace_id")
                .eq("user_id", userId)
                .eq("workspace_id", workspaceId)
                .limit(1)
                .maybeSingle();
            return !error && Boolean(data?.workspace_id);
        };

        // Prefer the explicit workspace cookie when it's still valid membership.
        if (cookieWorkspaceId && (await isMember(cookieWorkspaceId))) {
            return cookieWorkspaceId;
        }

        // If auth is unavailable here, fail closed and require a fresh resolution path.
        if (authError || !userId) {
            return undefined;
        }

        // Next preference: the user's default workspace, but only when membership still exists.
        const { data: userRow } = await supabase
            .from("users")
            .select("default_workspace_id")
            .eq("user_id", userId)
            .maybeSingle();
        const defaultWorkspaceId = String(userRow?.default_workspace_id ?? "").trim();
        if (defaultWorkspaceId && (await isMember(defaultWorkspaceId))) {
            return defaultWorkspaceId;
        }

        // Final fallback: first workspace membership row for the user.
        const { data: membershipRow, error: membershipError } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", userId)
            .order("workspace_id", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (!membershipError && membershipRow?.workspace_id) {
            const fallbackWorkspaceId = String(membershipRow.workspace_id);
            // Best-effort self-heal so future reads don't keep selecting a stale default workspace.
            await supabase
                .from("users")
                .update({ default_workspace_id: fallbackWorkspaceId })
                .eq("user_id", userId);
            return fallbackWorkspaceId;
        }

        return undefined;
    } catch (e) {
        return undefined;
    }
}
