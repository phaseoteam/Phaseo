"use server"

import {
    requireAuthenticatedUser,
    requireWorkspaceMembership,
} from "@/utils/serverActionAuth";
import { setActiveWorkspaceCookie } from "@/utils/workspaceCookie";

export type WorkspaceSwitchResult =
    | { ok: true }
    | { ok: false; error: string };

export async function setActiveWorkspaceAction(workspaceId: string): Promise<WorkspaceSwitchResult> {
    try {
        if (!workspaceId || typeof workspaceId !== 'string') {
            return { ok: false, error: 'workspaceId required' };
        }
        const { supabase, user } = await requireAuthenticatedUser();
        await requireWorkspaceMembership(supabase, user.id, workspaceId);
        await setActiveWorkspaceCookie(workspaceId);

        return { ok: true };
    } catch (error) {
        const reason =
            error instanceof Error && error.message
                ? error.message
                : "failed to set cookie";
        console.warn("[workspace-switch] failed", {
            workspaceId,
            reason,
        });
        return { ok: false, error: reason };
    }
}

export const SwapTeam = setActiveWorkspaceAction;
