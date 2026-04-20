"use server"

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireTeamMembership } from "@/utils/serverActionAuth";

function revalidateWorkspacePaths() {
    revalidatePath("/settings/teams");
    revalidatePath("/settings/workspaces");
    revalidatePath("/settings/workspaces/members");
    revalidatePath("/settings/workspaces/settings");
}

/**
 * Server action: update a member's role.
 * Performs a supabase upsert on the `team_members` table and revalidates.
 */
export async function updateMemberRole(teamId: string, userId: string, newRole?: string) {
    if (!teamId || !userId) {
        throw new Error('Missing teamId or userId');
    }
    const normalizedRole = (newRole ?? "").toLowerCase();
    if (normalizedRole !== "admin" && normalizedRole !== "member") {
        throw new Error("Invalid role. Allowed roles are admin and member.");
    }

    const supabase = await createClient();
    const admin = createAdminClient();
    const {
        data: { user: authUser },
        error: authError,
    } = await supabase.auth.getUser();
    if (authError || !authUser?.id) {
        throw new Error("Not authenticated");
    }
    await requireTeamMembership(supabase, authUser.id, teamId, ["owner", "admin"]);

    const { data: teamData, error: teamError } = await admin
        .from("teams")
        .select("owner_user_id")
        .eq("id", teamId)
        .maybeSingle();
    if (teamError) throw teamError;
    if (teamData?.owner_user_id === userId) {
        throw new Error("The workspace owner role is fixed and cannot be changed.");
    }

    const { data, error } = await supabase
        .from("team_members")
        .upsert({ team_id: teamId, user_id: userId, role: normalizedRole }, { onConflict: "team_id,user_id" })
        .select("team_id, user_id, role")
        .maybeSingle();

    if (error) throw error;

    // Revalidate both legacy and renamed workspace settings routes.
    try {
        revalidateWorkspacePaths();
    } catch {
        // ignore revalidation errors
    }

    return { teamId, userId, role: data?.role ?? null, ok: true };
}

/**
 * Server action: remove a member from a team.
 */
export async function removeMember(teamId: string, userId: string) {
    if (!teamId || !userId) {
        throw new Error("Missing teamId or userId");
    }

    const supabase = await createClient();
    const admin = createAdminClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
        throw new Error("Not authenticated");
    }

    const actingUserId = user.id;
    const isSelf = actingUserId === userId;

    const rank = (role?: string | null) => {
        switch ((role || "").toLowerCase()) {
            case "owner":
                return 1;
            case "admin":
                return 2;
            case "member":
                return 3;
            default:
                return 4;
        }
    };

    let actingRole: string | undefined;
    if (!isSelf) {
        const { data: membership, error: membershipError } = await supabase
            .from("team_members")
            .select("role")
            .eq("team_id", teamId)
            .eq("user_id", actingUserId)
            .maybeSingle();

        if (membershipError) throw membershipError;

        actingRole = (membership?.role ?? "").toLowerCase();
        if (actingRole !== "owner" && actingRole !== "admin") {
            return {
                teamId,
                userId,
                ok: false as const,
                message: "You don't have permission to remove this member from the workspace.",
            };
        }

        const { data: targetMembership, error: targetMembershipError } = await admin
            .from("team_members")
            .select("role")
            .eq("team_id", teamId)
            .eq("user_id", userId)
            .maybeSingle();

        if (targetMembershipError) throw targetMembershipError;

        const actorRank = rank(actingRole);
        const targetRank = rank(targetMembership?.role);

        if (targetRank < actorRank) {
            return {
                teamId,
                userId,
                ok: false as const,
                message: "You can't remove a member with a higher role.",
            };
        }
    }

    // Check if the target user owns the team.
    const { data: teamData, error: teamError } = await admin
        .from("teams")
        .select("id, owner_user_id")
        .eq("id", teamId)
        .maybeSingle();

    if (teamError) throw teamError;

    if (teamData && teamData.owner_user_id === userId) {
        return {
            teamId,
            userId,
            ok: false as const,
            message: "You can't remove the workspace owner.",
        };
    }

    const { error } = await admin
        .from("team_members")
        .delete()
        .eq("team_id", teamId)
        .eq("user_id", userId);

    if (error) throw error;

    try {
        revalidateWorkspacePaths();
    } catch {
        // no-op
    }

    return { teamId, userId, ok: true as const };
}
