/**
 * Legacy workspace pricing cleanup cron
 * Purpose: Retained as a compatibility shim after the flat 5% pricing rollout
 * Schedule: Runs at 00:00 UTC on the 1st of each month
 *
 * HOW IT WORKS:
 * - Current pricing is single-tier and this job is effectively a no-op
 * - The RPC remains in place so older operational hooks do not break
 *
 * Setup Instructions (Option 1 - Preferred):
 * Use Supabase's built-in pg_cron extension:
 * SELECT cron.schedule(
 *     'cleanup-dormant-enterprise-teams',
 *     '0 0 1 * *',
 *     $$SELECT cleanup_dormant_enterprise_workspaces()$$
 * );
 *
 * Setup Instructions (Option 2 - Cloudflare Workers):
 * 1. Add to wrangler.toml: [triggers] crons = ["0 0 1 * *"]
 * 2. Export the handleScheduledEvent function
 * 3. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
 *
 * See TIER-SYSTEM.md for the current pricing model summary.
 */

import { getSupabaseAdmin } from "@/runtime/env";

export interface TierCleanupResult {
    success: boolean;
    total_teams_checked: number;
    teams_downgraded: number;
    downgraded_teams: Array<{
        workspace_id: string;
        old_tier: string;
        new_tier: string;
        spend_30d_usd: number;
    }>;
    processed_at: string;
    error?: string;
}

/**
 * Execute the legacy pricing cleanup RPC.
 * Calls the Supabase RPC function cleanup_dormant_enterprise_workspaces().
 *
 * In single-tier mode this returns an empty/no-op result.
 */
export async function executeDormantTeamCleanup(): Promise<TierCleanupResult> {
    try {
        const supabase = getSupabaseAdmin();

        console.log("[tier-cron] Running legacy workspace pricing cleanup...");

        const { data, error } = await supabase.rpc("cleanup_dormant_enterprise_workspaces");

        if (error) {
            console.error("[tier-cron] Error running compatibility cleanup:", error);
            return {
                success: false,
                total_teams_checked: 0,
                teams_downgraded: 0,
                downgraded_teams: [],
                processed_at: new Date().toISOString(),
                error: "compatibility_cleanup_failed",
            };
        }

        console.log("[tier-cron] Compatibility cleanup completed:", {
            checked: data.total_teams_checked,
            downgraded: data.teams_downgraded,
        });

        return {
            success: true,
            total_teams_checked: data.total_teams_checked ?? 0,
            teams_downgraded: data.teams_downgraded ?? 0,
            downgraded_teams: data.downgraded_teams ?? [],
            processed_at: data.processed_at ?? new Date().toISOString(),
        };
    } catch (err) {
        console.error("[tier-cron] Unexpected error:", err);
        return {
            success: false,
            total_teams_checked: 0,
            teams_downgraded: 0,
            downgraded_teams: [],
            processed_at: new Date().toISOString(),
            error: "compatibility_cleanup_failed",
        };
    }
}

/**
 * Cloudflare Workers Cron Handler
 * Add to wrangler.toml:
 *
 * [triggers]
 * crons = ["0 0 1 * *"]  # Midnight UTC on 1st of month
 */
export async function handleScheduledEvent(event: ScheduledEvent): Promise<void> {
    console.log("[tier-cron] Cron triggered at:", new Date(event.scheduledTime).toISOString());

    const result = await executeDormantTeamCleanup();

    if (result.success) {
        console.log(
            `[tier-cron] Completed compatibility cleanup: checked ${result.total_teams_checked}, downgraded ${result.teams_downgraded}`
        );
    } else {
        console.error(`[tier-cron] Failed: ${result.error}`);
    }
}

/**
 * HTTP Handler (for manual trigger or testing)
 * Can be called via: POST /api/admin/cleanup-dormant-teams
 */
export async function handleManualTrigger(request: Request): Promise<Response> {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    console.log("[tier-cron] Manual cleanup trigger requested");

    const result = await executeDormantTeamCleanup();

    return new Response(JSON.stringify(result, null, 2), {
        status: result.success ? 200 : 500,
        headers: { "Content-Type": "application/json" },
    });
}
