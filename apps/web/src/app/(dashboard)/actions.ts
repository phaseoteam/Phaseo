"use server"

import {
    requireAuthenticatedUser,
    requireWorkspaceMembership,
} from "@/utils/serverActionAuth";
import { setActiveWorkspaceCookie } from "@/utils/workspaceCookie";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export type WorkspaceSwitchResult =
    | { ok: true }
    | { ok: false; error: string };

export async function setActiveWorkspaceAction(workspaceId: string): Promise<WorkspaceSwitchResult> {
    try {
        if (!workspaceId || typeof workspaceId !== 'string') {
            return { ok: false, error: 'workspaceId required' };
        }
        const { supabase, user } = await requireAuthenticatedUser();
        if ((await fetchInternalAuthHeaderData({ limit: 1 })).providerMode) {
            return { ok: false, error: "Provider accounts manage their catalog without switching workspaces." };
        }
        await requireWorkspaceMembership(supabase, user.id, workspaceId);
        await setActiveWorkspaceCookie(workspaceId);

        const { data: { session } } = await supabase.auth.getSession();
		if (session?.access_token) {
			try {
				await fetchAccountWebApi<{ ok: boolean }>(
					"/api/account/auth/workspace-accessed",
					session.access_token,
					{ method: "POST", body: JSON.stringify({ workspaceId }) },
				);
			} catch {
				// Recency is advisory and must not block a workspace switch.
			}
		}

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
