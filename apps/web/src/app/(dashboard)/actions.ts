"use server"

import { cookies } from "next/headers";
import {
    requireAuthenticatedUser,
    requireWorkspaceMembership,
} from "@/utils/serverActionAuth";

export async function setActiveWorkspaceAction(workspaceId: string) {
    try {
        if (!workspaceId || typeof workspaceId !== 'string') {
            return { ok: false, error: 'workspaceId required' };
        }
        const { supabase, user } = await requireAuthenticatedUser();
        await requireWorkspaceMembership(supabase, user.id, workspaceId);
        const cookieStore: any = await cookies();
        cookieStore.set({
            name: 'activeWorkspaceId',
            value: workspaceId,
            httpOnly: true,
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30,
        });

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
